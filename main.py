import sqlite3
import os
import uuid
import json
from pathlib import Path
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import io


BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
DB_PATH = BASE_DIR / "dubrovka_defects.db"

app = FastAPI(title="ЖК Дубровка - Приемка квартир")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

CATEGORIES = [
    "Стены/Пол/Потолок",
    "Окна",
    "Двери",
    "Сантехника",
    "Электрика",
    "Отопление",
    "Вентиляция",
    "Балкон/Лоджия",
    "Другое"
]

STATUSES = {
    "new": "Новое",
    "in_progress": "В работе",
    "ready": "Готово",
    "rejected": "Отклонено"
}

TEMPLATES = {
    "Стены/Пол/Потолок": [
        "Трещина на стене",
        "Неровная поверхность стены",
        "Отслоение штукатурки",
        "Пятно на стене",
        "Скол на плитке",
        "Трещина на полу",
        "Неровный пол",
        "Скрип пола",
        "Трещина на потолке",
        "Пятно на потолке (возможна протечка)"
    ],
    "Окна": [
        "Регулировка/брак фурнитуры",
        "Продувание створки",
        "Продувание глухого СП",
        "Продувание монтажного шва",
        "Брак СП створки",
        "Брак глухого СП",
        "Дефект уплотнительных резинок",
        "Отклонениние",
        "Рестоврация створки",
        "Загрязнение"
    ],
    "Двери": [
        "Не закрывается дверь",
        "Скрип двери",
        "Зазор у двери"
    ],
    "Сантехника": [
        "Течет кран",
        "Не смывает унитаз",
        "Засор в раковине",
        "Нет горячей воды"
    ],
    "Электрика": [
        "Не работает розетка",
        "Не горит свет",
        "Нет заземления"
    ],
    "Отопление": [
        "Холодная батарея",
        "Течет батарея",
        "Шум в батарее"
    ],
    "Вентиляция": [
        "Нет тяги в вентиляции",
        "Шум вентиляции"
    ],
    "Балкон/Лоджия": [
        "Засор слива",
        "Протечка на балконе"
    ],
    "Другое": [
        "Зазоры между стенами",
        "Грязь на стенах"
    ]
}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def has_column(conn, table_name, column_name):
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def migrate_sections_to_sections_only(conn):
    if not has_column(conn, "sections", "building_number"):
        return

    sections = conn.execute(
        """
        SELECT id, complex_id, apartment_from, apartment_to, floors
        FROM sections
        ORDER BY complex_id, building_number, section_number, id
        """
    ).fetchall()

    if not sections:
        conn.execute("ALTER TABLE sections RENAME TO sections_old")
        conn.execute(
            """
            CREATE TABLE sections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id INTEGER NOT NULL,
                section_number INTEGER NOT NULL,
                apartment_from INTEGER NOT NULL,
                apartment_to INTEGER NOT NULL,
                floors INTEGER DEFAULT 5,
                FOREIGN KEY (complex_id) REFERENCES complexes(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("DROP TABLE sections_old")
        conn.commit()
        return

    renumbered = []
    current_complex_id = None
    next_section_number = 0
    for row in sections:
        if row["complex_id"] != current_complex_id:
            current_complex_id = row["complex_id"]
            next_section_number = 1
        else:
            next_section_number += 1

        renumbered.append({
            "id": row["id"],
            "complex_id": row["complex_id"],
            "section_number": next_section_number,
            "apartment_from": row["apartment_from"],
            "apartment_to": row["apartment_to"],
            "floors": row["floors"],
        })

    conn.execute("ALTER TABLE sections RENAME TO sections_old")
    conn.execute(
        """
        CREATE TABLE sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            complex_id INTEGER NOT NULL,
            section_number INTEGER NOT NULL,
            apartment_from INTEGER NOT NULL,
            apartment_to INTEGER NOT NULL,
            floors INTEGER DEFAULT 5,
            FOREIGN KEY (complex_id) REFERENCES complexes(id) ON DELETE CASCADE
        )
        """
    )

    for row in renumbered:
        conn.execute(
            """
            INSERT INTO sections (id, complex_id, section_number, apartment_from, apartment_to, floors)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row["complex_id"],
                row["section_number"],
                row["apartment_from"],
                row["apartment_to"],
                row["floors"],
            )
        )

    conn.execute("DROP TABLE sections_old")
    conn.commit()


def normalize_sections_payload(sections_data):
    if not isinstance(sections_data, list) or not sections_data:
        raise HTTPException(status_code=400, detail="Добавьте хотя бы одну секцию")

    normalized_sections = []
    seen_sections = set()

    for sec in sections_data:
        if not isinstance(sec, dict):
            raise HTTPException(status_code=400, detail="Некорректные данные секции")

        try:
            section_number = int(sec.get("section_number"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Укажите корректный номер секции")

        if section_number < 1:
            raise HTTPException(status_code=400, detail="Номер секции должен быть больше нуля")
        if section_number in seen_sections:
            raise HTTPException(status_code=400, detail=f"Секция {section_number} указана дважды")

        floors_data = sec.get("floors")
        if not isinstance(floors_data, list) or not floors_data:
            raise HTTPException(status_code=400, detail=f"Добавьте этажи в секцию {section_number}")

        seen_sections.add(section_number)
        normalized_floors = []

        for floor_info in floors_data:
            if not isinstance(floor_info, dict):
                raise HTTPException(status_code=400, detail=f"Некорректные данные этажа в секции {section_number}")

            try:
                floor_num = int(floor_info.get("floor"))
                apt_from = int(floor_info.get("apartment_from"))
                apt_to = int(floor_info.get("apartment_to"))
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"Заполните этаж и диапазон квартир в секции {section_number}")

            if floor_num < 1:
                raise HTTPException(status_code=400, detail="Номер этажа должен быть больше нуля")
            if apt_from < 1 or apt_to < 1:
                raise HTTPException(status_code=400, detail="Номера квартир должны быть больше нуля")
            if apt_from > apt_to:
                raise HTTPException(status_code=400, detail=f"В секции {section_number} диапазон квартир задан неверно")

            normalized_floors.append({
                "floor": floor_num,
                "apartment_from": apt_from,
                "apartment_to": apt_to,
            })

        normalized_sections.append({
            "section_number": section_number,
            "floors": normalized_floors,
            "building_number": sec.get("building_number", 1),
        })

    return normalized_sections


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS complexes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            property_type TEXT DEFAULT 'квартиры',
            commissioning_date TEXT DEFAULT '',
            warranty_3_date TEXT DEFAULT '',
            warranty_5_date TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            complex_id INTEGER NOT NULL,
            section_number INTEGER NOT NULL,
            apartment_from INTEGER NOT NULL,
            apartment_to INTEGER NOT NULL,
            floors INTEGER DEFAULT 5,
            building_number INTEGER DEFAULT 1,
            FOREIGN KEY (complex_id) REFERENCES complexes(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS apartments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            complex_id INTEGER NOT NULL,
            section_id INTEGER NOT NULL,
            number INTEGER NOT NULL,
            floor INTEGER NOT NULL,
            status TEXT DEFAULT 'available',
            access_status TEXT DEFAULT 'available',
            access_phone TEXT,
            FOREIGN KEY (complex_id) REFERENCES complexes(id) ON DELETE CASCADE,
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS defects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            apartment_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            window_number INTEGER,
            description TEXT NOT NULL,
            status TEXT DEFAULT 'new',
            deadline DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            defect_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            defect_id INTEGER NOT NULL,
            author TEXT DEFAULT 'Пользователь',
            text TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS comment_photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS defect_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            defect_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            status TEXT DEFAULT 'new',
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE
        );
    """)
    
    # Миграция: добавляем колонку property_type если её нет
    try:
        conn.execute("ALTER TABLE complexes ADD COLUMN property_type TEXT DEFAULT 'квартиры'")
        conn.commit()
    except:
        pass  # Колонка уже существует
    
    migrate_sections_to_sections_only(conn)
    
    # Миграция: добавляем building_number если её нет
    try:
        conn.execute("ALTER TABLE sections ADD COLUMN building_number INTEGER DEFAULT 1")
        conn.commit()
    except:
        pass  # Колонка уже существует
    
    # Миграция: добавляем колонку window_number если её нет
    try:
        conn.execute("ALTER TABLE defects ADD COLUMN window_number INTEGER")
        conn.commit()
    except:
        pass  # Колонка уже существует
    
    # Миграция: добавляем колонку access_status если её нет
    try:
        conn.execute("ALTER TABLE apartments ADD COLUMN access_status TEXT DEFAULT 'available'")
        conn.commit()
    except:
        pass  # Колонка уже существует
    
    # Миграция: добавляем колонку access_phone если её нет
    try:
        conn.execute("ALTER TABLE apartments ADD COLUMN access_phone TEXT")
        conn.commit()
    except:
        pass  # Колонка уже существует
    
    # Миграция: добавляем колонку updated_at в comments если её нет
    try:
        conn.execute("ALTER TABLE comments ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP")
        conn.commit()
    except:
        pass  # Колонка уже существует
    
    # Миграция: добавляем колонку access_comment если её нет
    try:
        conn.execute("ALTER TABLE apartments ADD COLUMN access_comment TEXT")
        conn.commit()
    except:
        pass  # Колонка уже существует
    
    # Создаем таблицу item_comments если её нет
    conn.execute("""
        CREATE TABLE IF NOT EXISTS item_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL,
            author TEXT DEFAULT 'Пользователь',
            text TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (item_id) REFERENCES defect_items(id) ON DELETE CASCADE
        )
    """)
    conn.commit()
    
    conn.close()


init_db()


class ComplexCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class SectionCreate(BaseModel):
    section_number: int
    apartment_from: int
    apartment_to: int
    floors: int = 5


class DefectCreate(BaseModel):
    category: str
    description: str
    deadline: Optional[str] = None


@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse((BASE_DIR / "templates" / "index.html").read_text(encoding="utf-8"))


# === COMPLEX ENDPOINTS ===

@app.get("/api/complexes")
async def get_complexes():
    conn = get_db()
    rows = conn.execute("SELECT id, name, property_type, commissioning_date, warranty_3_date, warranty_5_date, created_at FROM complexes ORDER BY created_at DESC").fetchall()
    complexes = []
    
    for row in rows:
        c = dict(row)
        sections = conn.execute(
            "SELECT * FROM sections WHERE complex_id = ? ORDER BY section_number",
            (c["id"],)
        ).fetchall()
        c["sections"] = [dict(s) for s in sections]
        c["apartments_count"] = conn.execute(
            "SELECT COUNT(*) FROM apartments WHERE complex_id = ?",
            (c["id"],)
        ).fetchone()[0]
        c["defects_count"] = conn.execute("""
            SELECT COUNT(*)
            FROM defects d
            JOIN apartments a ON d.apartment_id = a.id
            WHERE a.complex_id = ? AND d.status NOT IN ('ready', 'rejected')
        """, (c["id"],)).fetchone()[0]
        
        access_stats = conn.execute("""
            SELECT access_status, COUNT(*) as count 
            FROM apartments 
            WHERE complex_id = ? 
            GROUP BY access_status
        """, (c["id"],)).fetchall()
        c["by_access_status"] = [dict(row) for row in access_stats]
        complexes.append(c)
    
    conn.close()
    return complexes


@app.post("/api/complexes")
async def create_complex(
    name: str = Form(...),
    property_type: str = Form("квартиры"),
    commissioning_date: str = Form(""),
    warranty_3_date: str = Form(""),
    warranty_5_date: str = Form(""),
    sections: Optional[str] = Form(None),
    buildings: Optional[str] = Form(None)
):
    if property_type not in {"квартиры", "апартаменты"}:
        raise HTTPException(status_code=400, detail="Некорректный тип недвижимости")

    raw_payload = sections if sections is not None else buildings
    if raw_payload is None:
        raise HTTPException(status_code=400, detail="Добавьте хотя бы одну секцию")

    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Некорректная структура объекта") from exc

    if sections is not None:
        normalized_sections = normalize_sections_payload(payload)
    else:
        if not isinstance(payload, list) or not payload:
            raise HTTPException(status_code=400, detail="Добавьте хотя бы одну секцию")

        merged_sections = []
        for building in payload:
            if not isinstance(building, dict):
                raise HTTPException(status_code=400, detail="Некорректные данные секции")
            building_sections = building.get("sections")
            if not isinstance(building_sections, list):
                raise HTTPException(status_code=400, detail="Некорректная структура секций")
            building_number = building.get("building_number", 1)
            for sec in building_sections:
                sec["building_number"] = building_number
            merged_sections.extend(building_sections)

        normalized_sections = normalize_sections_payload(merged_sections)
    
    conn = get_db()
    
    # Создаем ЖК
    cursor = conn.execute("INSERT INTO complexes (name, property_type, commissioning_date, warranty_3_date, warranty_5_date) VALUES (?, ?, ?, ?, ?)", (name, property_type, commissioning_date, warranty_3_date, warranty_5_date))
    complex_id = cursor.lastrowid
    
    total_apartments = 0
    
    for sec in normalized_sections:
        floors_data = sec.get("floors", [])

        floor_nums = [f.get("floor", 1) for f in floors_data]
        min_floor = min(floor_nums)
        max_floor = max(floor_nums)

        all_from = [f.get("apartment_from", 1) for f in floors_data]
        all_to = [f.get("apartment_to", 1) for f in floors_data]
        min_apt = min(all_from)
        max_apt = max(all_to)

        cursor = conn.execute(
            """
            INSERT INTO sections (complex_id, section_number, apartment_from, apartment_to, floors, building_number)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (complex_id, sec["section_number"], min_apt, max_apt, max_floor, sec.get("building_number", 1))
        )
        section_id = cursor.lastrowid

        for floor_info in floors_data:
            floor_num = floor_info.get("floor", 1)
            apt_from = floor_info.get("apartment_from", 1)
            apt_to = floor_info.get("apartment_to", 1)

            for apt_num in range(apt_from, apt_to + 1):
                conn.execute(
                    """
                    INSERT INTO apartments (complex_id, section_id, number, floor)
                    VALUES (?, ?, ?, ?)
                    """,
                    (complex_id, section_id, apt_num, floor_num)
                )
                total_apartments += 1
    
    conn.commit()
    conn.close()
    
    return {"id": complex_id, "message": "Объект создан", "apartments_created": total_apartments}


@app.get("/api/complexes/{complex_id}")
async def get_complex(complex_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM complexes WHERE id = ?", (complex_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="ЖК не найден")
    
    complex_data = dict(row)
    
    # Секции
    sections = conn.execute(
        "SELECT *, building_number FROM sections WHERE complex_id = ? ORDER BY building_number, section_number",
        (complex_id,)
    ).fetchall()
    complex_data["sections"] = [dict(s) for s in sections]
    
    # Статистика
    complex_data["total_apartments"] = conn.execute(
        "SELECT COUNT(*) FROM apartments WHERE complex_id = ?",
        (complex_id,)
    ).fetchone()[0]
    
    complex_data["defects_count"] = conn.execute("""
        SELECT COUNT(*) FROM defects d
        JOIN apartments a ON d.apartment_id = a.id
        WHERE a.complex_id = ?
    """, (complex_id,)).fetchone()[0]
    
    conn.close()
    return complex_data


@app.delete("/api/complexes/{complex_id}")
async def delete_complex(complex_id: int):
    conn = get_db()
    
    row = conn.execute("SELECT id FROM complexes WHERE id = ?", (complex_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="ЖК не найден")
    
    defects = conn.execute("""
        SELECT p.filename FROM photos p
        JOIN defects d ON p.defect_id = d.id
        JOIN apartments a ON d.apartment_id = a.id
        WHERE a.complex_id = ?
    """, (complex_id,)).fetchall()
    
    for photo in defects:
        file_path = UPLOAD_DIR / photo["filename"]
        if file_path.exists():
            file_path.unlink()
    
    conn.execute("DELETE FROM complexes WHERE id = ?", (complex_id,))
    conn.commit()
    conn.close()
    
    return {"message": "ЖК удален"}


@app.put("/api/complexes/{complex_id}")
async def update_complex(complex_id: int, name: str = Form(...)):
    conn = get_db()
    
    row = conn.execute("SELECT id FROM complexes WHERE id = ?", (complex_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="ЖК не найден")
    
    conn.execute("UPDATE complexes SET name = ? WHERE id = ?", (name, complex_id))
    conn.commit()
    conn.close()
    
    return {"message": "ЖК обновлен"}


# === APARTMENT ENDPOINTS ===

@app.get("/api/complexes/{complex_id}/apartments")
async def get_apartments(
    complex_id: int,
    section_ids: Optional[str] = None,
    section_id: Optional[int] = None,
    floor: Optional[int] = None,
    status: Optional[str] = None,
    numbers: Optional[str] = None
):
    conn = get_db()
    
    query = """
        SELECT a.*, s.section_number, s.building_number,
               (SELECT COUNT(*) FROM defects WHERE apartment_id = a.id AND status NOT IN ('ready', 'rejected')) as active_defects_count,
               (SELECT COUNT(*) FROM defects WHERE apartment_id = a.id) as total_defects,
               (SELECT MIN(deadline) FROM defects WHERE apartment_id = a.id AND status NOT IN ('ready', 'rejected')) as earliest_deadline,
               (SELECT MIN(created_at) FROM defects WHERE apartment_id = a.id AND status NOT IN ('ready', 'rejected')) as earliest_defect_created,
               CASE 
                    WHEN (SELECT COUNT(*) FROM defects WHERE apartment_id = a.id AND status NOT IN ('ready', 'rejected')) = 0 
                         AND (SELECT COUNT(*) FROM defects WHERE apartment_id = a.id) > 0
                    THEN 1
                    ELSE 0
               END as is_ready
        FROM apartments a
        JOIN sections s ON a.section_id = s.id
        WHERE a.complex_id = ?
    """
    params = [complex_id]
    
    # Handle multiple section_ids (comma-separated)
    if section_ids:
        section_id_list = [int(x.strip()) for x in section_ids.split(',') if x.strip().isdigit()]
        if section_id_list:
            placeholders = ','.join('?' * len(section_id_list))
            query += f" AND a.section_id IN ({placeholders})"
            params.extend(section_id_list)  # type: ignore
    elif section_id:
        query += " AND a.section_id = ?"
        params.append(section_id)
    
    if floor:
        query += " AND a.floor = ?"
        params.append(floor)
    if status:
        query += " AND a.status = ?"
        params.append(status)
    
    # Handle multiple apartment numbers (comma-separated)
    if numbers:
        number_list = [int(x.strip()) for x in numbers.split(',') if x.strip().lstrip('-').isdigit()]
        if number_list:
            placeholders = ','.join('?' * len(number_list))
            query += f" AND a.number IN ({placeholders})"
            params.extend(number_list)
    
    query += " ORDER BY s.section_number, a.floor, a.number"
    
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.get("/api/complexes/{complex_id}/sections")
async def get_sections(complex_id: int):
    conn = get_db()
    rows = conn.execute(
        "SELECT *, building_number FROM sections WHERE complex_id = ? ORDER BY building_number, section_number",
        (complex_id,)
    ).fetchall()
    sections = []
    
    for row in rows:
        s = dict(row)
        s["apartments_count"] = conn.execute(
            "SELECT COUNT(*) FROM apartments WHERE section_id = ?",
            (s["id"],)
        ).fetchone()[0]
        sections.append(s)
    
    conn.close()
    return sections


@app.get("/api/complexes/{complex_id}/floors")
async def get_floors(complex_id: int):
    conn = get_db()
    rows = conn.execute(
        "SELECT DISTINCT floor FROM apartments WHERE complex_id = ? ORDER BY floor",
        (complex_id,)
    ).fetchall()
    conn.close()
    return [row[0] for row in rows]


# === DEFECT ENDPOINTS ===

@app.get("/api/complexes/{complex_id}/defects")
async def get_complex_defects(complex_id: int):
    conn = get_db()
    rows = conn.execute("""
        SELECT d.*, a.number as apartment_number, a.section_id
        FROM defects d
        JOIN apartments a ON d.apartment_id = a.id
        WHERE a.complex_id = ?
        ORDER BY a.section_id, a.number, d.created_at DESC
    """, (complex_id,)).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.get("/api/apartments/{apartment_id}/defects")
async def get_defects(apartment_id: int):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM defects WHERE apartment_id = ? ORDER BY created_at DESC",
        (apartment_id,)
    ).fetchall()
    
    defects = []
    for row in rows:
        d = dict(row)
        photos = conn.execute(
            "SELECT id, filename FROM photos WHERE defect_id = ?",
            (d["id"],)
        ).fetchall()
        d["photos"] = [dict(p) for p in photos]
        d["status_label"] = STATUSES.get(d["status"], d["status"])
        
        # Получаем пункты замечания
        items = conn.execute(
            "SELECT * FROM defect_items WHERE defect_id = ? ORDER BY sort_order, id",
            (d["id"],)
        ).fetchall()
        d["items"] = []
        for item in items:
            item_dict = dict(item)
            item_dict["status_label"] = STATUSES.get(item_dict["status"], item_dict["status"])
            
            # Получаем комментарии к пункту
            item_comments = conn.execute(
                "SELECT * FROM item_comments WHERE item_id = ? ORDER BY created_at",
                (item_dict["id"],)
            ).fetchall()
            item_dict["comments"] = [dict(c) for c in item_comments]
            
            d["items"].append(item_dict)
        
        defects.append(d)
    
    conn.close()
    return defects


@app.post("/api/apartments/{apartment_id}/defects")
async def create_defect(
    apartment_id: int,
    category: str = Form(...),
    description: str = Form(...),
    deadline: str = Form(None),
    window_number: int = Form(None),
    photos: List[UploadFile] = File(default=[])
):
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Неверная категория")
    
    # Автоматически ставим дедлайн +2 месяца если не указан
    if not deadline:
        deadline_date = datetime.now() + relativedelta(months=2)
        deadline = deadline_date.strftime('%Y-%m-%d')
    
    conn = get_db()
    
    # Проверяем существование квартиры
    apt = conn.execute("SELECT id FROM apartments WHERE id = ?", (apartment_id,)).fetchone()
    if not apt:
        conn.close()
        raise HTTPException(status_code=404, detail="Квартира не найдена")
    
    cursor = conn.execute("""
        INSERT INTO defects (apartment_id, category, window_number, description, deadline)
        VALUES (?, ?, ?, ?, ?)
    """, (apartment_id, category, window_number, description, deadline))
    defect_id = cursor.lastrowid
    
    # Парсим пункты из описания (каждая строка = отдельный пункт)
    lines = [line.strip() for line in description.split('\n') if line.strip()]
    for idx, line in enumerate(lines):
        conn.execute(
            "INSERT INTO defect_items (defect_id, text, sort_order) VALUES (?, ?, ?)",
            (defect_id, line, idx)
        )
    
    # Сохраняем фото
    for photo in photos:
        if photo.filename:
            ext = Path(photo.filename).suffix.lower()
            if ext not in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov']:
                continue
            
            unique_name = f"{uuid.uuid4().hex}{ext}"
            file_path = UPLOAD_DIR / unique_name
            
            with open(file_path, "wb") as f:
                content = await photo.read()
                f.write(content)
            
            conn.execute(
                "INSERT INTO photos (defect_id, filename, original_name) VALUES (?, ?, ?)",
                (defect_id, unique_name, photo.filename)
            )
    
    conn.commit()
    conn.close()
    
    return {"id": defect_id, "message": "Замечание добавлено"}


# === DEFECT ITEMS ENDPOINTS ===

@app.post("/api/defects/{defect_id}/items")
async def add_defect_item(defect_id: int, text: str = Form(...)):
    conn = get_db()

    if not text.strip():
        conn.close()
        raise HTTPException(status_code=400, detail="Текст пункта не может быть пустым")

    defect = conn.execute("SELECT id FROM defects WHERE id = ?", (defect_id,)).fetchone()
    if not defect:
        conn.close()
        raise HTTPException(status_code=404, detail="Замечание не найдено")
    
    # Получаем максимальный sort_order
    max_order = conn.execute(
        "SELECT MAX(sort_order) FROM defect_items WHERE defect_id = ?",
        (defect_id,)
    ).fetchone()[0] or 0
    
    cursor = conn.execute(
        "INSERT INTO defect_items (defect_id, text, sort_order) VALUES (?, ?, ?)",
        (defect_id, text.strip(), max_order + 1)
    )
    item_id = cursor.lastrowid
    
    conn.commit()
    conn.close()
    
    return {"id": item_id, "message": "Пункт добавлен"}


@app.put("/api/defects/items/{item_id}")
async def update_item_status(item_id: int, status: str = Form(...)):
    if status not in STATUSES:
        raise HTTPException(status_code=400, detail="Неверный статус")
    
    conn = get_db()
    item = conn.execute("SELECT id FROM defect_items WHERE id = ?", (item_id,)).fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Пункт не найден")

    conn.execute(
        "UPDATE defect_items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (status, item_id)
    )
    conn.commit()
    conn.close()
    
    return {"message": "Статус обновлен"}


@app.put("/api/defects/items/{item_id}/text")
async def update_item_text(item_id: int, text: str = Form(...)):
    cleaned_text = text.strip()
    if not cleaned_text:
        raise HTTPException(status_code=400, detail="Текст пункта не может быть пустым")

    conn = get_db()
    item = conn.execute("SELECT id FROM defect_items WHERE id = ?", (item_id,)).fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Пункт не найден")

    conn.execute(
        "UPDATE defect_items SET text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (cleaned_text, item_id)
    )
    conn.commit()
    conn.close()
    
    return {"message": "Текст обновлен"}


@app.delete("/api/defects/items/{item_id}")
async def delete_item(item_id: int):
    conn = get_db()
    item = conn.execute("SELECT id FROM defect_items WHERE id = ?", (item_id,)).fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Пункт не найден")

    conn.execute("DELETE FROM defect_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    
    return {"message": "Пункт удален"}


@app.post("/api/defects/items/{item_id}/comments")
async def add_item_comment(item_id: int, text: str = Form(...), author: str = Form("Пользователь")):
    cleaned_text = text.strip()
    if not cleaned_text:
        raise HTTPException(status_code=400, detail="Комментарий не может быть пустым")

    conn = get_db()
    item = conn.execute("SELECT id FROM defect_items WHERE id = ?", (item_id,)).fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Пункт не найден")

    cursor = conn.execute(
        "INSERT INTO item_comments (item_id, author, text) VALUES (?, ?, ?)",
        (item_id, author, cleaned_text)
    )
    comment_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {"id": comment_id, "message": "Комментарий добавлен"}


@app.get("/api/defects/items/{item_id}/comments")
async def get_item_comments(item_id: int):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM item_comments WHERE item_id = ? ORDER BY created_at",
        (item_id,)
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.put("/api/defects/items/comments/{comment_id}")
async def update_item_comment(comment_id: int, text: str = Form(...)):
    conn = get_db()
    conn.execute(
        "UPDATE item_comments SET text = ? WHERE id = ?",
        (text, comment_id)
    )
    conn.commit()
    conn.close()
    return {"message": "Комментарий обновлен"}


@app.delete("/api/defects/items/comments/{comment_id}")
async def delete_item_comment(comment_id: int):
    conn = get_db()
    conn.execute("DELETE FROM item_comments WHERE id = ?", (comment_id,))
    conn.commit()
    conn.close()
    
    return {"message": "Комментарий удален"}


@app.put("/api/defects/{defect_id}")
async def update_defect_status(defect_id: int, status: str = Form(...)):
    if status not in STATUSES:
        raise HTTPException(status_code=400, detail="Неверный статус")
    
    conn = get_db()
    conn.execute("""
        UPDATE defects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    """, (status, defect_id))
    conn.commit()
    conn.close()
    
    return {"message": "Статус обновлен"}


@app.delete("/api/defects/{defect_id}")
async def delete_defect(defect_id: int):
    conn = get_db()
    
    # Удаляем фото
    photos = conn.execute("SELECT filename FROM photos WHERE defect_id = ?", (defect_id,)).fetchall()
    for photo in photos:
        file_path = UPLOAD_DIR / photo["filename"]
        if file_path.exists():
            file_path.unlink()
    
    conn.execute("DELETE FROM defects WHERE id = ?", (defect_id,))
    conn.commit()
    conn.close()
    
    return {"message": "Замечание удалено"}


@app.put("/api/apartments/{apartment_id}/access")
async def update_apartment_access(
    apartment_id: int, 
    access_status: str = Form(...),
    access_phone: str = Form(None),
    access_comment: str = Form(None)
):
    # Новые статусы доступа
    valid_statuses = ['available', 'owner_accepted', 'call', 'no_access', 'by_phone', 'elevated']
    if access_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Неверный статус доступа")
    
    conn = get_db()
    cur = conn.execute("SELECT access_phone, access_comment FROM apartments WHERE id = ?", (apartment_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Квартира не найдена")

    existing_phone = row[0]
    existing_comment = row[1]
    
    if access_phone is not None:
        new_phone = access_phone if access_phone else None
    else:
        new_phone = existing_phone

    if access_comment is not None:
        new_comment = access_comment if access_comment else None
    else:
        new_comment = existing_comment
    
    conn.execute(
        "UPDATE apartments SET access_status = ?, access_phone = ?, access_comment = ? WHERE id = ?", 
        (access_status, new_phone, new_comment, apartment_id)
    )
    conn.commit()
    conn.close()
    
    return {"message": "Статус доступа обновлен"}


@app.get("/api/health")
async def healthcheck():
    return {"status": "ok"}


# === OTHER ENDPOINTS ===

@app.get("/api/categories")
async def get_categories():
    return {"categories": CATEGORIES}


@app.get("/api/templates/{category}")
async def get_templates(category: str):
    if category not in TEMPLATES:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    return {"category": category, "templates": TEMPLATES[category]}


@app.get("/api/complexes/{complex_id}/statistics")
async def get_complex_statistics(complex_id: int):
    conn = get_db()
    
    # Всего квартир
    total = conn.execute(
        "SELECT COUNT(*) FROM apartments WHERE complex_id = ?",
        (complex_id,)
    ).fetchone()[0]
    
    # Квартир с замечаниями
    with_defects = conn.execute("""
        SELECT COUNT(DISTINCT a.id) FROM apartments a
        JOIN defects d ON a.id = d.apartment_id
        WHERE a.complex_id = ?
    """, (complex_id,)).fetchone()[0]
    
    # По статусам дефектов
    defect_status_stats = conn.execute("""
        SELECT d.status, COUNT(*) as count
        FROM defects d
        JOIN apartments a ON d.apartment_id = a.id
        WHERE a.complex_id = ?
        GROUP BY d.status
    """, (complex_id,)).fetchall()
    
    # По статусам доступа
    access_status_stats = conn.execute("""
        SELECT a.access_status, COUNT(*) as count
        FROM apartments a
        WHERE a.complex_id = ?
        GROUP BY a.access_status
    """, (complex_id,)).fetchall()
    
    # По секциям
    section_stats = conn.execute("""
        SELECT s.section_number, COUNT(d.id) as count
        FROM sections s
        LEFT JOIN apartments a ON s.id = a.section_id
        LEFT JOIN defects d ON a.id = d.apartment_id
        WHERE s.complex_id = ?
        GROUP BY s.id
        ORDER BY s.section_number
    """, (complex_id,)).fetchall()
    
    conn.close()
    
    return {
        "total_apartments": total,
        "with_defects": with_defects,
        "without_defects": total - with_defects,
        "by_defect_status": [dict(row) for row in defect_status_stats],
        "by_access_status": [dict(row) for row in access_status_stats],
        "by_section": [dict(row) for row in section_stats]
    }


# === COMMENTS ENDPOINTS ===

@app.get("/api/defects/{defect_id}/comments")
async def get_comments(defect_id: int):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM comments WHERE defect_id = ? ORDER BY created_at DESC",
        (defect_id,)
    ).fetchall()
    
    comments = []
    for row in rows:
        c = dict(row)
        photos = conn.execute(
            "SELECT id, filename FROM comment_photos WHERE comment_id = ?",
            (c["id"],)
        ).fetchall()
        c["photos"] = [dict(p) for p in photos]
        comments.append(c)
    
    conn.close()
    return comments


@app.post("/api/defects/{defect_id}/comments")
async def add_comment(
    defect_id: int,
    text: str = Form(...),
    author: str = Form("Пользователь"),
    photos: List[UploadFile] = File(default=[])
):
    conn = get_db()
    
    cursor = conn.execute(
        "INSERT INTO comments (defect_id, author, text) VALUES (?, ?, ?)",
        (defect_id, author, text)
    )
    comment_id = cursor.lastrowid
    
    # Сохраняем фото комментария
    for photo in photos:
        if photo.filename:
            ext = Path(photo.filename).suffix.lower()
            if ext not in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
                continue
            
            unique_name = f"{uuid.uuid4().hex}{ext}"
            file_path = UPLOAD_DIR / unique_name
            
            with open(file_path, "wb") as f:
                content = await photo.read()
                f.write(content)
            
            conn.execute(
                "INSERT INTO comment_photos (comment_id, filename, original_name) VALUES (?, ?, ?)",
                (comment_id, unique_name, photo.filename)
            )
    
    conn.commit()
    conn.close()
    
    return {"id": comment_id, "message": "Комментарий добавлен"}


@app.delete("/api/comments/{comment_id}")
async def delete_comment(comment_id: int):
    conn = get_db()
    
    # Удаляем фото комментария
    photos = conn.execute("SELECT filename FROM comment_photos WHERE comment_id = ?", (comment_id,)).fetchall()
    for photo in photos:
        file_path = UPLOAD_DIR / photo["filename"]
        if file_path.exists():
            file_path.unlink()
    
    conn.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
    conn.commit()
    conn.close()
    
    return {"message": "Комментарий удален"}


# === PDF EXPORT ENDPOINT ===

@app.get("/api/complexes/{complex_id}/export/pdf")
async def export_complex_pdf(complex_id: int, section_id: Optional[int] = None):
    conn = get_db()
    
    # Информация о ЖК
    complex_row = conn.execute("SELECT * FROM complexes WHERE id = ?", (complex_id,)).fetchone()
    if not complex_row:
        conn.close()
        raise HTTPException(status_code=404, detail="ЖК не найден")
    
    complex_name = complex_row["name"]
    
    # Формируем запрос для получения замечаний
    query = """
        SELECT 
            d.*,
            a.number as apt_number,
            a.floor,
            s.section_number
        FROM defects d
        JOIN apartments a ON d.apartment_id = a.id
        JOIN sections s ON a.section_id = s.id
        WHERE a.complex_id = ?
    """
    params = [complex_id]
    
    if section_id:
        query += " AND a.section_id = ?"
        params.append(section_id)
    
    query += " ORDER BY s.section_number, a.floor, a.number, d.created_at DESC"
    
    defects = conn.execute(query, params).fetchall()
    
    # Статистика
    total_defects = len(defects)
    by_status = {}
    for d in defects:
        status = d["status"]
        by_status[status] = by_status.get(status, 0) + 1
    
    conn.close()
    
    # Создаем PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    # Регистрируем шрифт с поддержкой кириллицы
    try:
        pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
        font_name = 'DejaVuSans'
    except:
        font_name = 'Helvetica'
    
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name='Russian',
        fontName=font_name,
        fontSize=10,
        leading=14
    ))
    styles.add(ParagraphStyle(
        name='RussianTitle',
        fontName=font_name,
        fontSize=18,
        leading=24,
        alignment=1,
        spaceAfter=20
    ))
    styles.add(ParagraphStyle(
        name='RussianHeading',
        fontName=font_name,
        fontSize=14,
        leading=18,
        spaceAfter=10
    ))
    
    story = []
    
    # Заголовок
    story.append(Paragraph(f"Отчет по приемке квартир", styles['RussianTitle']))
    story.append(Paragraph(f"ЖК: {complex_name}", styles['RussianHeading']))
    story.append(Spacer(1, 20))
    
    # Дата формирования
    story.append(Paragraph(f"Дата формирования: {datetime.now().strftime('%d.%m.%Y %H:%M')}", styles['Russian']))
    story.append(Spacer(1, 10))
    
    # Статистика
    story.append(Paragraph("Сводная статистика:", styles['RussianHeading']))
    stats_data = [
        ["Показатель", "Значение"],
        ["Всего замечаний", str(total_defects)],
        ["Новых", str(by_status.get('new', 0))],
        ["В работе", str(by_status.get('in_progress', 0))],
        ["Готово", str(by_status.get('ready', 0))],
        ["Отклонено", str(by_status.get('rejected', 0))]
    ]
    
    stats_table = Table(stats_data, colWidths=[8*cm, 4*cm])
    stats_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), font_name),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#667eea')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f3f4f6')])
    ]))
    story.append(stats_table)
    story.append(Spacer(1, 30))
    
    # Список замечаний
    if defects:
        story.append(Paragraph("Список замечаний:", styles['RussianHeading']))
        story.append(Spacer(1, 10))
        
        for i, d in enumerate(defects, 1):
            status_label = STATUSES.get(d["status"], d["status"])
            window_info = f" (Окно №{d['window_number']})" if d['window_number'] else ""
            
            defect_text = f"""
            <b>{i}. Квартира {d['apt_number']}</b> (Секция {d['section_number']}, {d['floor']} этаж)<br/>
            <b>Категория:</b> {d['category']}{window_info}<br/>
            <b>Статус:</b> {status_label}<br/>
            <b>Описание:</b> {d['description']}<br/>
            <b>Срок:</b> {d['deadline'] if d['deadline'] else 'Не указан'} | 
            <b>Создано:</b> {datetime.fromisoformat(d['created_at']).strftime('%d.%m.%Y')}
            """
            story.append(Paragraph(defect_text, styles['Russian']))
            story.append(Spacer(1, 15))
    else:
        story.append(Paragraph("Замечаний не найдено.", styles['Russian']))
    
    doc.build(story)
    buffer.seek(0)
    
    section_suffix = f"_section{section_id}" if section_id else ""
    filename = f"defects_report_{complex_id}{section_suffix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
