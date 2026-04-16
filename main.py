import sqlite3
import os
import uuid
import json
import time
import logging
from pathlib import Path
from datetime import datetime, timedelta, date
from dateutil.relativedelta import relativedelta
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
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
from reportlab.graphics.shapes import Drawing, PolyLine, String, Line, Circle, Rect
import io


BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
DB_PATH = BASE_DIR / "dubrovka_defects.db"
DEFECT_UPLOAD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic", ".heif"}
COMMENT_UPLOAD_EXTENSIONS = DEFECT_UPLOAD_EXTENSIONS
UPLOAD_CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
    "image/heic": ".heic",
    "image/heif": ".heif",
}

app = FastAPI(title="ЖК Дубровка - Перспектива Инжиниринг гарантийный сервис")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
logger = logging.getLogger("dubrovka")
SLOW_REQUEST_THRESHOLD_SECONDS = 1.5


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started_at = time.perf_counter()
    method = request.method
    path = request.url.path
    query = request.url.query
    target = f"{path}?{query}" if query else path

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.perf_counter() - started_at) * 1000, 1)
        logger.exception("Unhandled error on %s %s in %sms", method, target, duration_ms)
        raise

    duration_ms = round((time.perf_counter() - started_at) * 1000, 1)
    status_code = response.status_code

    if status_code >= 500:
        logger.error("HTTP %s on %s %s in %sms", status_code, method, target, duration_ms)
    elif duration_ms >= SLOW_REQUEST_THRESHOLD_SECONDS * 1000:
        logger.warning("Slow request %s %s -> %s in %sms", method, target, status_code, duration_ms)

    return response

CATEGORIES = [
    "Общестроительные работы",
    "Окна",
    "Двери",
    "Сантехника",
    "Электрика",
    "Вентиляция",
    "Прочее"
]

STATUSES = {
    "new": "Зафиксированно",
    "recorded": "Зафиксированно",
    "in_progress": "В работе",
    "on_review": "На проверке",
    "completed": "Выполнено",
    "rejected": "Отклонено"
}

STATUS_MIGRATION = {
    "new": "recorded",
    "assigned": "in_progress",
    "rework": "in_progress",
    "ready": "completed",
    "ready_for_acceptance": "on_review",
    "accepted": "completed",
    "cancelled": "rejected"
}

CLOSED_DEFECT_STATUSES = ("completed", "rejected", "on_review")
MERGE_BLOCKING_DEFECT_STATUSES = ("rejected",)
ACTIVE_DEFECT_STATUSES = tuple(status for status in STATUSES if status not in CLOSED_DEFECT_STATUSES)

TEMPLATES = {
    "Общестроительные работы": [
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
        "Нет горячей воды",
        "Холодная батарея",
        "Течет батарея",
        "Шум в батарее"
    ],
    "Электрика": [
        "Не работает розетка",
        "Не горит свет",
        "Нет заземления"
    ],
    "Вентиляция": [
        "Нет тяги в вентиляции",
        "Шум вентиляции"
    ],
    "Прочее": [
        "Зазоры между стенами",
        "Грязь на стенах"
    ]
}


def configure_db(conn):
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=5.0)
    return configure_db(conn)


def has_column(conn, table_name, column_name):
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(row[1] == column_name for row in rows)


def get_sections_building_number_expr(conn, alias: Optional[str] = None):
    if not has_column(conn, "sections", "building_number"):
        return "1"

    prefix = f"{alias}." if alias else ""
    return f"{prefix}building_number"


def normalize_defect_text_lines(text: str) -> List[str]:
    if not text:
        return []
    return [line.strip() for line in text.splitlines() if line.strip()]


def ensure_defect_has_items(conn, defect_row):
    existing_items = conn.execute(
        "SELECT id FROM defect_items WHERE defect_id = ? LIMIT 1",
        (defect_row["id"],)
    ).fetchone()
    if existing_items:
        return

    for index, line in enumerate(normalize_defect_text_lines(defect_row["description"])):
        conn.execute(
            "INSERT INTO defect_items (defect_id, text, status, sort_order) VALUES (?, ?, ?, ?)",
            (defect_row["id"], line, defect_row["status"], index)
        )


def sync_defect_items_from_description(conn, defect_id: int, description: str, default_status: str):
    lines = normalize_defect_text_lines(description)
    existing_items = conn.execute(
        "SELECT id, status FROM defect_items WHERE defect_id = ? ORDER BY sort_order, id",
        (defect_id,)
    ).fetchall()

    shared_count = min(len(existing_items), len(lines))
    for index in range(shared_count):
        conn.execute(
            "UPDATE defect_items SET text = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (lines[index], index, existing_items[index]["id"])
        )

    for index in range(shared_count, len(lines)):
        conn.execute(
            "INSERT INTO defect_items (defect_id, text, status, sort_order) VALUES (?, ?, ?, ?)",
            (defect_id, lines[index], default_status, index)
        )

    for index in range(shared_count, len(existing_items)):
        conn.execute("DELETE FROM defect_items WHERE id = ?", (existing_items[index]["id"],))


def sync_defect_description_from_items(conn, defect_id: int):
    rows = conn.execute(
        "SELECT text FROM defect_items WHERE defect_id = ? ORDER BY sort_order, id",
        (defect_id,)
    ).fetchall()
    description = "\n".join((row["text"] or "").strip() for row in rows if (row["text"] or "").strip())
    conn.execute(
        "UPDATE defects SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (description, defect_id)
    )


def merge_defect_texts(*texts: str) -> str:
    merged_lines = []
    seen = set()
    for text in texts:
        for line in normalize_defect_text_lines(text):
            key = line.casefold()
            if key in seen:
                continue
            seen.add(key)
            merged_lines.append(line)
    return "\n".join(merged_lines)


def parse_defect_items_payload(raw_payload: str) -> List[dict]:
    if not raw_payload:
        return []

    try:
        data = json.loads(raw_payload)
    except json.JSONDecodeError:
        return []

    if not isinstance(data, list):
        return []

    items = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        text = str(entry.get("text") or "").strip()
        if not text:
            continue
        items.append({
            "id": entry.get("id"),
            "key": str(entry.get("key") or "").strip(),
            "text": text,
        })

    return items


def sync_defect_in_progress_status_from_items(conn, defect_id: int):
    defect = conn.execute("SELECT status FROM defects WHERE id = ?", (defect_id,)).fetchone()
    if not defect:
        return

    items = conn.execute(
        "SELECT status FROM defect_items WHERE defect_id = ? ORDER BY sort_order, id",
        (defect_id,)
    ).fetchall()

    item_statuses = [row["status"] for row in items]
    next_status = defect["status"]

    if not item_statuses:
        next_status = "recorded"
    elif any(status == "in_progress" for status in item_statuses):
        next_status = "in_progress"
    elif all(status == "completed" for status in item_statuses):
        next_status = "completed"
    elif any(status == "on_review" for status in item_statuses):
        next_status = "on_review"
    else:
        next_status = "recorded"

    conn.execute(
        "UPDATE defects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (next_status, defect_id)
    )


def sync_all_defect_statuses_from_items(conn):
    defect_ids = conn.execute("SELECT id FROM defects").fetchall()
    for row in defect_ids:
        sync_defect_in_progress_status_from_items(conn, row["id"])


def resolve_upload_extension(upload: UploadFile, allowed_extensions: set[str]) -> str:
    ext = Path(upload.filename or "").suffix.lower()
    if ext in allowed_extensions:
        return ext

    content_type_ext = UPLOAD_CONTENT_TYPE_EXTENSIONS.get((upload.content_type or "").lower())
    if content_type_ext in allowed_extensions:
        return content_type_ext

    return ""


def get_defect_location_label(category: Optional[str], window_number: Optional[int], variant_number: Optional[str]) -> str:
    normalized_category = (category or "").strip()
    if normalized_category == "Окна" and window_number:
        return f"Окно {window_number}"
    if normalized_category == "Двери":
        normalized_variant = (variant_number or "").strip()
        if normalized_variant == "Входная":
            return "Входная дверь"
        if normalized_variant == "Межкомнатная":
            return "Межкомнатная дверь"
        return "Дверь"
    return normalized_category or "Не указано"


def get_defect_status_rank(status: str) -> int:
    try:
        return list(STATUSES.keys()).index(status)
    except ValueError:
        return -1


def build_not_in_clause(values) -> str:
    return ','.join('?' for _ in values)


def normalize_status_input(status: Optional[str]) -> Optional[str]:
    if status is None:
        return None

    cleaned_status = status.strip()
    if not cleaned_status:
        return cleaned_status

    if cleaned_status in STATUSES:
        return cleaned_status

    migrated_status = STATUS_MIGRATION.get(cleaned_status)
    if migrated_status:
        return migrated_status

    lowered_status = cleaned_status.casefold()
    for key, label in STATUSES.items():
        if lowered_status == label.casefold():
            return key

    for old_status, new_status in STATUS_MIGRATION.items():
        if lowered_status == old_status.casefold():
            return new_status

    return cleaned_status


def merge_duplicate_window_and_door_defects(conn):
    duplicate_groups = conn.execute(
        f"""
        SELECT apartment_id, category, window_number, variant_number, COUNT(*) AS defects_count
        FROM defects
        WHERE category IN ('Окна', 'Двери')
          AND status NOT IN ({','.join('?' for _ in MERGE_BLOCKING_DEFECT_STATUSES)})
        GROUP BY apartment_id, category, COALESCE(window_number, -1), COALESCE(variant_number, '')
        HAVING COUNT(*) > 1
        """,
        MERGE_BLOCKING_DEFECT_STATUSES,
    ).fetchall()

    merged_groups = 0
    for group in duplicate_groups:
        defects = conn.execute(
            f"""
            SELECT *
            FROM defects
            WHERE apartment_id = ?
              AND category = ?
              AND COALESCE(window_number, -1) = COALESCE(?, -1)
              AND COALESCE(variant_number, '') = COALESCE(?, '')
              AND status NOT IN ({build_not_in_clause(MERGE_BLOCKING_DEFECT_STATUSES)})
            ORDER BY datetime(created_at) ASC, id ASC
            """,
            (
                group["apartment_id"],
                group["category"],
                group["window_number"],
                group["variant_number"],
                *MERGE_BLOCKING_DEFECT_STATUSES,
            ),
        ).fetchall()
        if len(defects) < 2:
            continue

        keeper = defects[0]
        duplicates = defects[1:]

        for defect in defects:
            ensure_defect_has_items(conn, defect)

        merged_description = merge_defect_texts(*(defect["description"] for defect in defects))
        merged_restoration = 1 if any(defect["restoration"] for defect in defects) else 0
        merged_restoration_completed = 1 if any(defect["restoration_completed"] for defect in defects) else 0
        has_review_defect = any(defect["status"] == "on_review" for defect in defects)
        has_active_duplicate = any(
            defect["status"] not in CLOSED_DEFECT_STATUSES
            for defect in defects
        )
        if has_review_defect and has_active_duplicate:
            merged_status = "in_progress"
        else:
            merged_status = max(defects, key=lambda defect: get_defect_status_rank(defect["status"]))["status"]
        merged_deadline = min(
            (defect["deadline"] for defect in defects if defect["deadline"]),
            default=keeper["deadline"],
        )

        contractor_id = keeper["contractor_id"]
        contractor_name = keeper["contractor_name"] or ""
        executor = keeper["executor"] or ""
        comment_text = keeper["comment_text"] or ""
        project_name = keeper["project_name"] or ""
        materials_info = keeper["materials_info"] or ""
        cost_amount = keeper["cost_amount"] or ""
        labor_cost = keeper["labor_cost"] or ""

        for defect in duplicates:
            if contractor_id is None and defect["contractor_id"] is not None:
                contractor_id = defect["contractor_id"]
            if not contractor_name and defect["contractor_name"]:
                contractor_name = defect["contractor_name"]
            if not executor and defect["executor"]:
                executor = defect["executor"]
            if not comment_text and defect["comment_text"]:
                comment_text = defect["comment_text"]
            if not project_name and defect["project_name"]:
                project_name = defect["project_name"]
            if not materials_info and defect["materials_info"]:
                materials_info = defect["materials_info"]
            if not cost_amount and defect["cost_amount"]:
                cost_amount = defect["cost_amount"]
            if not labor_cost and defect["labor_cost"]:
                labor_cost = defect["labor_cost"]

        next_sort_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) FROM defect_items WHERE defect_id = ?",
            (keeper["id"],)
        ).fetchone()[0] + 1

        for defect in duplicates:
            items = conn.execute(
                "SELECT id FROM defect_items WHERE defect_id = ? ORDER BY sort_order, id",
                (defect["id"],)
            ).fetchall()
            for item in items:
                conn.execute(
                    "UPDATE defect_items SET defect_id = ?, sort_order = ? WHERE id = ?",
                    (keeper["id"], next_sort_order, item["id"])
                )
                next_sort_order += 1

            conn.execute("UPDATE photos SET defect_id = ? WHERE defect_id = ?", (keeper["id"], defect["id"]))
            conn.execute("UPDATE comments SET defect_id = ? WHERE defect_id = ?", (keeper["id"], defect["id"]))

        conn.execute(
            """
            UPDATE defects
            SET description = ?, status = ?, restoration = ?, restoration_completed = ?, contractor_id = ?, contractor_name = ?,
                executor = ?, comment_text = ?, project_name = ?, materials_info = ?, cost_amount = ?,
                labor_cost = ?, deadline = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                merged_description,
                merged_status,
                merged_restoration,
                merged_restoration_completed,
                contractor_id,
                contractor_name,
                executor,
                comment_text,
                project_name,
                materials_info,
                cost_amount,
                labor_cost,
                merged_deadline,
                keeper["id"],
            )
        )

        conn.executemany(
            "DELETE FROM defects WHERE id = ?",
            [(defect["id"],) for defect in duplicates]
        )
        merged_groups += 1

    return merged_groups


def migrate_sections_to_sections_only(conn):
    # Migration disabled - sections table is already in correct format
    return

    if not sections:
        conn.execute("DROP TABLE IF EXISTS sections_old")
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


def migrate_defect_statuses(conn, table_name):
    for old_status, new_status in STATUS_MIGRATION.items():
        conn.execute(
            f"UPDATE {table_name} SET status = ? WHERE status = ?",
            (new_status, old_status),
        )


def build_status_sort_case(column_name: str = "status"):
    return f"""
        CASE {column_name}
            WHEN 'recorded' THEN 1
            WHEN 'in_progress' THEN 2
            WHEN 'on_review' THEN 3
            WHEN 'completed' THEN 4
            WHEN 'rejected' THEN 5
            ELSE 6
        END
    """


def ensure_contractor(conn, contractor_name: Optional[str]):
    cleaned_name = (contractor_name or "").strip()
    if not cleaned_name:
        return None, ""

    existing = conn.execute(
        "SELECT id, name FROM contractors WHERE lower(name) = lower(?)",
        (cleaned_name,),
    ).fetchone()
    if existing:
        return existing["id"], existing["name"]

    cursor = conn.execute(
        "INSERT INTO contractors (name) VALUES (?)",
        (cleaned_name,),
    )
    return cursor.lastrowid, cleaned_name


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS complexes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT DEFAULT '',
            image_url TEXT DEFAULT '',
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
            restoration INTEGER DEFAULT 0,
            restoration_completed INTEGER DEFAULT 0,
            variant_number TEXT DEFAULT '',
            project_name TEXT DEFAULT '',
            materials_info TEXT DEFAULT '',
            cost_amount TEXT DEFAULT '',
            labor_cost TEXT DEFAULT '',
            comment_text TEXT DEFAULT '',
            description TEXT NOT NULL,
            status TEXT DEFAULT 'recorded',
            contractor_id INTEGER,
            contractor_name TEXT DEFAULT '',
            executor TEXT DEFAULT '',
            deadline DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE,
            FOREIGN KEY (contractor_id) REFERENCES contractors(id) ON DELETE SET NULL
        );
        
        CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            defect_id INTEGER NOT NULL,
            item_id INTEGER,
            filename TEXT NOT NULL,
            original_name TEXT,
            photo_type TEXT DEFAULT 'before',
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
            status TEXT DEFAULT 'recorded',
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS apartment_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            apartment_id INTEGER NOT NULL,
            old_status TEXT,
            new_status TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS contractors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    # Миграция: добавляем колонку property_type если её нет
    try:
        conn.execute("ALTER TABLE complexes ADD COLUMN property_type TEXT DEFAULT 'квартиры'")
        conn.commit()
    except:
        pass  # Колонка уже существует

    try:
        conn.execute("ALTER TABLE complexes ADD COLUMN address TEXT DEFAULT ''")
        conn.commit()
    except:
        pass

    try:
        conn.execute("ALTER TABLE complexes ADD COLUMN image_url TEXT DEFAULT ''")
        conn.commit()
    except:
        pass
    
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

    try:
        conn.execute("ALTER TABLE defects ADD COLUMN contractor_name TEXT DEFAULT ''")
        conn.commit()
    except:
        pass

    try:
        conn.execute("ALTER TABLE defects ADD COLUMN contractor_id INTEGER")
        conn.commit()
    except:
        pass

    for column_name in [
        "variant_number TEXT DEFAULT ''",
        "project_name TEXT DEFAULT ''",
        "materials_info TEXT DEFAULT ''",
        "cost_amount TEXT DEFAULT ''",
        "labor_cost TEXT DEFAULT ''",
        "comment_text TEXT DEFAULT ''",
    ]:
        try:
            conn.execute(f"ALTER TABLE defects ADD COLUMN {column_name}")
            conn.commit()
        except:
            pass
    
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

    # Миграция: добавляем колонку restoration_completed если её нет
    try:
        conn.execute("ALTER TABLE defects ADD COLUMN restoration_completed INTEGER DEFAULT 0")
        conn.commit()
    except:
        pass  # Колонка уже существует

    try:
        conn.execute("ALTER TABLE photos ADD COLUMN item_id INTEGER")
        conn.commit()
    except:
        pass
    
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

    migrate_defect_statuses(conn, "defects")
    migrate_defect_statuses(conn, "defect_items")

    legacy_contractors = conn.execute(
        "SELECT DISTINCT contractor_name FROM defects WHERE trim(COALESCE(contractor_name, '')) != ''"
    ).fetchall()
    for row in legacy_contractors:
        ensure_contractor(conn, row[0])

    defects_without_link = conn.execute(
        "SELECT id, contractor_name FROM defects WHERE contractor_id IS NULL AND trim(COALESCE(contractor_name, '')) != ''"
    ).fetchall()
    for row in defects_without_link:
        contractor_id, contractor_name = ensure_contractor(conn, row["contractor_name"])
        conn.execute(
            "UPDATE defects SET contractor_id = ?, contractor_name = ? WHERE id = ?",
            (contractor_id, contractor_name, row["id"]),
        )

    merge_duplicate_window_and_door_defects(conn)
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


class ClientErrorLog(BaseModel):
    message: str
    source: Optional[str] = ""
    lineno: Optional[int] = 0
    colno: Optional[int] = 0
    stack: Optional[str] = ""
    href: Optional[str] = ""
    user_agent: Optional[str] = ""


@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse((BASE_DIR / "templates" / "index.html").read_text(encoding="utf-8"))


@app.post("/api/client-error")
async def log_client_error(payload: ClientErrorLog):
    logger.error(
        "Client error: message=%s source=%s line=%s col=%s href=%s ua=%s stack=%s",
        payload.message,
        payload.source,
        payload.lineno,
        payload.colno,
        payload.href,
        payload.user_agent,
        payload.stack,
    )
    return {"ok": True}


@app.get("/style-variants", response_class=HTMLResponse)
async def style_variants():
    return HTMLResponse((BASE_DIR / "templates" / "style_variants.html").read_text(encoding="utf-8"))


# === COMPLEX ENDPOINTS ===

@app.get("/api/complexes")
async def get_complexes():
    conn = get_db()
    rows = conn.execute("SELECT id, name, address, image_url, property_type, commissioning_date, warranty_3_date, warranty_5_date, created_at FROM complexes ORDER BY created_at DESC").fetchall()
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
            WHERE a.complex_id = ? AND d.status NOT IN ('completed', 'rejected', 'on_review')
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
    address: str = Form(""),
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
    cursor = conn.execute("INSERT INTO complexes (name, address, property_type, commissioning_date, warranty_3_date, warranty_5_date) VALUES (?, ?, ?, ?, ?, ?)", (name, address, property_type, commissioning_date, warranty_3_date, warranty_5_date))
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
    building_number_expr = get_sections_building_number_expr(conn)
    
    # Секции
    sections = conn.execute(
        f"SELECT *, {building_number_expr} AS building_number FROM sections WHERE complex_id = ? ORDER BY {building_number_expr}, section_number",
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
    building_number_expr = get_sections_building_number_expr(conn, "s")
    
    query = """
        SELECT a.*, s.section_number, {building_number_expr} AS building_number,
               (SELECT COUNT(*) FROM defects WHERE apartment_id = a.id AND status NOT IN ('rejected', 'on_review', 'completed') AND restoration != 1)
               + (SELECT COUNT(*) FROM defects WHERE apartment_id = a.id AND restoration = 1 AND restoration_completed != 1) as active_defects_count,
               (SELECT COUNT(*) FROM defects WHERE apartment_id = a.id) as total_defects,
               (SELECT COUNT(*) FROM defects WHERE apartment_id = a.id AND status = 'recorded') as recorded_defects_count,
               (SELECT COUNT(*) FROM defects WHERE apartment_id = a.id AND status = 'in_progress') as in_progress_defects_count,
               (SELECT COUNT(*) FROM defects WHERE apartment_id = a.id AND status = 'on_review') as on_review_defects_count,
               (SELECT COUNT(*) FROM defects WHERE apartment_id = a.id AND status = 'completed') as completed_defects_count,
               (SELECT MIN(deadline) FROM defects WHERE apartment_id = a.id AND status NOT IN ('completed', 'rejected', 'on_review')) as earliest_deadline,
               (SELECT MIN(created_at) FROM defects WHERE apartment_id = a.id AND status NOT IN ('completed', 'rejected', 'on_review')) as earliest_defect_created,
               CASE 
                    WHEN (SELECT COUNT(*) FROM defects WHERE apartment_id = a.id AND status NOT IN ('completed', 'rejected', 'on_review')) = 0 
                         AND (SELECT COUNT(*) FROM defects WHERE apartment_id = a.id) > 0
                    THEN 1
                    ELSE 0
               END as is_ready
        FROM apartments a
        JOIN sections s ON a.section_id = s.id
        WHERE a.complex_id = ?
    """.format(building_number_expr=building_number_expr)
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
    building_number_expr = get_sections_building_number_expr(conn)
    rows = conn.execute(
        f"SELECT *, {building_number_expr} AS building_number FROM sections WHERE complex_id = ? ORDER BY {building_number_expr}, section_number",
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
        SELECT d.*, a.number as apartment_number, a.section_id,
               COALESCE(c.name, d.contractor_name, '') as contractor_name,
               c.id as contractor_id
        FROM defects d
        JOIN apartments a ON d.apartment_id = a.id
        LEFT JOIN contractors c ON d.contractor_id = c.id
        WHERE a.complex_id = ?
        ORDER BY a.section_id, a.number,
                 CASE d.status
                    WHEN 'recorded' THEN 1
                    WHEN 'in_progress' THEN 2
                    WHEN 'on_review' THEN 3
                    WHEN 'completed' THEN 4
                    WHEN 'rejected' THEN 5
                    ELSE 6
                 END,
                 d.deadline IS NULL,
                 d.deadline,
                 d.created_at DESC
    """, (complex_id,)).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.post("/api/complexes/{complex_id}/item-comments")
async def get_complex_item_comments(complex_id: int, apartment_ids_json: str = Form("[]"), category_filter: str = Form("")):
    try:
        apartment_ids = [int(value) for value in json.loads(apartment_ids_json or "[]")]
    except (TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Некорректный список квартир")

    apartment_ids = list(dict.fromkeys(apartment_ids))
    if not apartment_ids:
        return []

    conn = get_db()
    placeholders = ",".join("?" for _ in apartment_ids)
    building_number_expr = get_sections_building_number_expr(conn, "s")
    category_filter = (category_filter or "").strip()
    category_clause = "AND d.category = ?" if category_filter else ""
    query_params = [complex_id, *apartment_ids]
    if category_filter:
        query_params.append(category_filter)
    query_params += [complex_id, *apartment_ids]
    if category_filter:
        query_params.append(category_filter)
    query_params += [complex_id, *apartment_ids]
    if category_filter:
        query_params.append(category_filter)
    rows = conn.execute(
        f"""
        SELECT *
        FROM (
            SELECT
                a.id AS apartment_id,
                a.number AS apartment_number,
                a.floor AS apartment_floor,
                s.section_number AS section_number,
                {building_number_expr} AS building_number,
                d.category AS defect_category,
                d.window_number AS defect_window_number,
                d.variant_number AS defect_variant_number,
                d.created_at AS defect_created_at,
                'item_comment' AS comment_source,
                ic.id AS comment_id,
                ic.author AS comment_author,
                ic.text AS comment_text,
                ic.created_at AS comment_created_at
            FROM item_comments ic
            JOIN defect_items di ON di.id = ic.item_id
            JOIN defects d ON d.id = di.defect_id
            JOIN apartments a ON a.id = d.apartment_id
            LEFT JOIN sections s ON s.id = a.section_id
            WHERE a.complex_id = ?
              AND a.id IN ({placeholders})
              {category_clause}

            UNION ALL

            SELECT
                a.id AS apartment_id,
                a.number AS apartment_number,
                a.floor AS apartment_floor,
                s.section_number AS section_number,
                {building_number_expr} AS building_number,
                d.category AS defect_category,
                d.window_number AS defect_window_number,
                d.variant_number AS defect_variant_number,
                d.created_at AS defect_created_at,
                'defect_comment' AS comment_source,
                c.id AS comment_id,
                c.author AS comment_author,
                c.text AS comment_text,
                c.created_at AS comment_created_at
            FROM comments c
            JOIN defects d ON d.id = c.defect_id
            JOIN apartments a ON a.id = d.apartment_id
            LEFT JOIN sections s ON s.id = a.section_id
            WHERE a.complex_id = ?
              AND a.id IN ({placeholders})
              {category_clause}

            UNION ALL

            SELECT
                a.id AS apartment_id,
                a.number AS apartment_number,
                a.floor AS apartment_floor,
                s.section_number AS section_number,
                {building_number_expr} AS building_number,
                d.category AS defect_category,
                d.window_number AS defect_window_number,
                d.variant_number AS defect_variant_number,
                d.created_at AS defect_created_at,
                'defect_note' AS comment_source,
                d.id AS comment_id,
                '' AS comment_author,
                d.comment_text AS comment_text,
                COALESCE(d.updated_at, d.created_at) AS comment_created_at
            FROM defects d
            JOIN apartments a ON a.id = d.apartment_id
            LEFT JOIN sections s ON s.id = a.section_id
            WHERE a.complex_id = ?
              AND a.id IN ({placeholders})
              {category_clause}
              AND TRIM(COALESCE(d.comment_text, '')) != ''
        ) combined_comments
        ORDER BY
            building_number,
            section_number,
            apartment_floor,
            apartment_number,
            CASE WHEN defect_category = 'Окна' THEN 0 ELSE 1 END,
            CASE WHEN defect_category = 'Окна' THEN COALESCE(defect_window_number, 9999) ELSE 0 END,
            defect_created_at,
            comment_created_at,
            comment_id
        """,
        query_params,
    ).fetchall()
    conn.close()

    grouped: dict[int, dict] = {}
    for row in rows:
        apartment_id = row["apartment_id"]
        if apartment_id not in grouped:
            grouped[apartment_id] = {
                "apartment": {
                    "id": apartment_id,
                    "number": row["apartment_number"],
                    "floor": row["apartment_floor"],
                    "section_number": row["section_number"],
                    "building_number": row["building_number"],
                },
                "comments": [],
            }

        grouped[apartment_id]["comments"].append({
            "id": row["comment_id"],
            "author": row["comment_author"],
            "text": row["comment_text"],
            "created_at": row["comment_created_at"],
            "defect_created_at": row["defect_created_at"],
            "category": row["defect_category"],
            "window_number": row["defect_window_number"],
            "location": get_defect_location_label(
                row["defect_category"],
                row["defect_window_number"],
                row["defect_variant_number"],
            ),
        })

    return list(grouped.values())


@app.get("/api/apartments/{apartment_id}/defects")
async def get_defects(apartment_id: int):
    conn = get_db()
    rows = conn.execute(
        f"""
        SELECT d.*, COALESCE(c.name, d.contractor_name, '') as contractor_name, c.id as contractor_id
        FROM defects d
        LEFT JOIN contractors c ON d.contractor_id = c.id
        WHERE d.apartment_id = ?
        ORDER BY {build_status_sort_case('d.status')}, d.deadline IS NULL, d.deadline, d.created_at DESC
        """,
        (apartment_id,)
    ).fetchall()
    
    defects = []
    for row in rows:
        d = dict(row)
        ensure_defect_has_items(conn, row)
        photos = [dict(p) for p in conn.execute(
            "SELECT id, filename, photo_type, item_id FROM photos WHERE defect_id = ? ORDER BY id",
            (d["id"],)
        ).fetchall()]
        d["photos"] = [photo for photo in photos if not photo.get("item_id")]
        d["comments_count"] = conn.execute(
            "SELECT COUNT(*) FROM comments WHERE defect_id = ?",
            (d["id"],)
        ).fetchone()[0]
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
            item_dict["photos"] = [photo for photo in photos if photo.get("item_id") == item_dict["id"]]
            
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
    defect_items_json: str = Form(""),
    status: str = Form("recorded"),
    contractor_id: str = Form(None),
    contractor_name: str = Form(""),
    variant_number: str = Form(""),
    project_name: str = Form(""),
    materials_info: str = Form(""),
    cost_amount: str = Form(""),
    labor_cost: str = Form(""),
    comment_text: str = Form(""),
    deadline: str = Form(None),
    window_number: int = Form(None),
    executor: str = Form(""),
    restoration: int = Form(0),
    photos: List[UploadFile] = File(default=[]),
    photo_types: List[str] = Form(default=[]),
    photo_item_keys: List[str] = Form(default=[])
):
    status = normalize_status_input(status)
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Неверная категория")

    if status not in STATUSES:
        raise HTTPException(status_code=400, detail="Неверный этап замечания")

    normalized_variant_number = variant_number.strip()
    if category == "Двери":
        if normalized_variant_number not in {"Межкомнатная", "Входная"}:
            raise HTTPException(status_code=400, detail="Для двери нужно выбрать Межкомнатная или Входная.")
    else:
        normalized_variant_number = ""
    
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

    defect_items = parse_defect_items_payload(defect_items_json)
    if not defect_items:
        defect_items = [{"id": None, "key": "legacy-0", "text": line} for line in normalize_defect_text_lines(description)]
    if not defect_items:
        conn.close()
        raise HTTPException(status_code=400, detail="Нужно добавить хотя бы один пункт замечания")

    normalized_description = "\n".join(item["text"] for item in defect_items)

    resolved_contractor_id = int(contractor_id) if contractor_id else None
    resolved_contractor_name = ""
    if contractor_name.strip():
        resolved_contractor_id, resolved_contractor_name = ensure_contractor(conn, contractor_name)
    elif resolved_contractor_id:
        contractor = conn.execute("SELECT id, name FROM contractors WHERE id = ?", (resolved_contractor_id,)).fetchone()
        if not contractor:
            conn.close()
            raise HTTPException(status_code=404, detail="Подрядчик не найден")
        resolved_contractor_id = contractor["id"]
        resolved_contractor_name = contractor["name"]

    existing_defect = None
    if category == "Окна":
        existing_defect = conn.execute(
            f"""
            SELECT id, description, restoration, restoration_completed, status
            FROM defects
            WHERE apartment_id = ? AND category = ? AND COALESCE(window_number, -1) = COALESCE(?, -1)
              AND status NOT IN ({build_not_in_clause(MERGE_BLOCKING_DEFECT_STATUSES)})
            ORDER BY id DESC
            LIMIT 1
            """,
            (apartment_id, category, window_number, *MERGE_BLOCKING_DEFECT_STATUSES)
        ).fetchone()
    elif category == "Двери":
        existing_defect = conn.execute(
            f"""
            SELECT id, description, restoration, restoration_completed, status
            FROM defects
            WHERE apartment_id = ? AND category = ? AND COALESCE(variant_number, '') = ?
              AND status NOT IN ({build_not_in_clause(MERGE_BLOCKING_DEFECT_STATUSES)})
            ORDER BY id DESC
            LIMIT 1
            """,
            (apartment_id, category, normalized_variant_number, *MERGE_BLOCKING_DEFECT_STATUSES)
        ).fetchone()

    if existing_defect:
        defect_id = existing_defect["id"]
        existing_description = (existing_defect["description"] or "").strip()
        appended_description = normalized_description
        merged_description = "\n".join(part for part in [existing_description, appended_description] if part)
        next_defect_status = existing_defect["status"] if existing_defect["status"] in {"new", "recorded"} else "in_progress"
        conn.execute(
            """
            UPDATE defects
            SET description = ?, restoration = ?, restoration_completed = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                merged_description,
                1 if restoration or existing_defect["restoration"] else 0,
                existing_defect["restoration_completed"] if (restoration or existing_defect["restoration"]) else 0,
                next_defect_status,
                defect_id,
            )
        )
    else:
        cursor = conn.execute("""
            INSERT INTO defects (
                apartment_id, category, window_number, restoration, executor, variant_number,
                description, status, deadline
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            apartment_id, category, window_number, restoration, executor.strip(), normalized_variant_number,
            normalized_description, status, deadline
        ))
        defect_id = cursor.lastrowid
    
    item_status = 'recorded' if existing_defect and existing_defect["status"] in {"new", "recorded"} else ('in_progress' if existing_defect else status)
    start_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) FROM defect_items WHERE defect_id = ?",
        (defect_id,)
    ).fetchone()[0] + 1
    item_key_to_id = {}
    for idx, item in enumerate(defect_items):
        cursor = conn.execute(
            "INSERT INTO defect_items (defect_id, text, status, sort_order) VALUES (?, ?, ?, ?)",
            (defect_id, item["text"], item_status, start_order + idx)
        )
        item_key_to_id[item["key"]] = cursor.lastrowid
    
    # Сохраняем фото
    for idx, photo in enumerate(photos):
        if photo.filename:
            ext = resolve_upload_extension(photo, DEFECT_UPLOAD_EXTENSIONS)
            if not ext:
                continue
            
            unique_name = f"{uuid.uuid4().hex}{ext}"
            file_path = UPLOAD_DIR / unique_name
            
            with open(file_path, "wb") as f:
                content = await photo.read()
                f.write(content)
            
            photo_type = photo_types[idx] if idx < len(photo_types) else 'before'
            photo_item_key = photo_item_keys[idx] if idx < len(photo_item_keys) else ''
            photo_item_id = item_key_to_id.get(photo_item_key)
            conn.execute(
                "INSERT INTO photos (defect_id, item_id, filename, original_name, photo_type) VALUES (?, ?, ?, ?, ?)",
                (defect_id, photo_item_id, unique_name, photo.filename, photo_type)
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

    defect = conn.execute("SELECT id, status FROM defects WHERE id = ?", (defect_id,)).fetchone()
    if not defect:
        conn.close()
        raise HTTPException(status_code=404, detail="Замечание не найдено")
    
    # Получаем максимальный sort_order
    max_order = conn.execute(
        "SELECT MAX(sort_order) FROM defect_items WHERE defect_id = ?",
        (defect_id,)
    ).fetchone()[0] or 0
    
    existing_items_count = conn.execute(
        "SELECT COUNT(*) FROM defect_items WHERE defect_id = ?",
        (defect_id,)
    ).fetchone()[0]

    cursor = conn.execute(
        "INSERT INTO defect_items (defect_id, text, status, sort_order) VALUES (?, ?, ?, ?)",
        (defect_id, text.strip(), 'in_progress' if existing_items_count else 'recorded', max_order + 1)
    )
    item_id = cursor.lastrowid
    sync_defect_description_from_items(conn, defect_id)
    
    conn.commit()
    conn.close()
    
    return {"id": item_id, "message": "Пункт добавлен"}


@app.put("/api/defects/items/{item_id}")
async def update_item_status(item_id: int, status: str = Form(...)):
    status = normalize_status_input(status)
    if status not in STATUSES:
        raise HTTPException(status_code=400, detail="Неверный статус")
    
    conn = get_db()
    item = conn.execute("SELECT id, defect_id, status FROM defect_items WHERE id = ?", (item_id,)).fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Пункт не найден")

    defect = conn.execute("SELECT id, status FROM defects WHERE id = ?", (item["defect_id"],)).fetchone()

    conn.execute(
        "UPDATE defect_items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (status, item_id)
    )
    sync_defect_in_progress_status_from_items(conn, item["defect_id"])
    conn.commit()
    conn.close()
    
    return {"message": "Статус обновлен"}


@app.put("/api/defects/items/{item_id}/text")
async def update_item_text(item_id: int, text: str = Form(...)):
    cleaned_text = text.strip()
    if not cleaned_text:
        raise HTTPException(status_code=400, detail="Текст пункта не может быть пустым")

    conn = get_db()
    item = conn.execute("SELECT id, defect_id FROM defect_items WHERE id = ?", (item_id,)).fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Пункт не найден")

    conn.execute(
        "UPDATE defect_items SET text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (cleaned_text, item_id)
    )
    sync_defect_description_from_items(conn, item["defect_id"])
    conn.commit()
    conn.close()
    
    return {"message": "Текст обновлен"}


@app.delete("/api/defects/items/{item_id}")
async def delete_item(item_id: int):
    conn = get_db()
    item = conn.execute("SELECT id, defect_id FROM defect_items WHERE id = ?", (item_id,)).fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Пункт не найден")

    photos = conn.execute("SELECT filename FROM photos WHERE item_id = ?", (item_id,)).fetchall()
    for photo in photos:
        file_path = UPLOAD_DIR / photo["filename"]
        if file_path.exists():
            file_path.unlink()
    conn.execute("DELETE FROM photos WHERE item_id = ?", (item_id,))
    conn.execute("DELETE FROM defect_items WHERE id = ?", (item_id,))
    sync_defect_description_from_items(conn, item["defect_id"])
    sync_defect_in_progress_status_from_items(conn, item["defect_id"])
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
    cleaned_text = text.strip()
    if not cleaned_text:
        raise HTTPException(status_code=400, detail="Комментарий не может быть пустым")

    conn = get_db()
    comment = conn.execute("SELECT id FROM item_comments WHERE id = ?", (comment_id,)).fetchone()
    if not comment:
        conn.close()
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    conn.execute(
        "UPDATE item_comments SET text = ? WHERE id = ?",
        (cleaned_text, comment_id)
    )
    conn.commit()
    conn.close()
    return {"message": "Комментарий обновлен"}


@app.delete("/api/defects/items/comments/{comment_id}")
async def delete_item_comment(comment_id: int):
    conn = get_db()
    comment = conn.execute("SELECT id FROM item_comments WHERE id = ?", (comment_id,)).fetchone()
    if not comment:
        conn.close()
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    conn.execute("DELETE FROM item_comments WHERE id = ?", (comment_id,))
    conn.commit()
    conn.close()
    
    return {"message": "Комментарий удален"}


@app.put("/api/defects/{defect_id}")
async def update_defect_status(defect_id: int, status: str = Form(...)):
    status = normalize_status_input(status)
    if status not in STATUSES:
        raise HTTPException(status_code=400, detail="Неверный статус")

    conn = get_db()
    defect = conn.execute("SELECT id, status FROM defects WHERE id = ?", (defect_id,)).fetchone()
    if not defect:
        conn.close()
        raise HTTPException(status_code=404, detail="Замечание не найдено")

    conn.execute(
        "UPDATE defects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (status, defect_id),
    )
    if status == "in_progress":
        conn.execute(
            "UPDATE defect_items SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE defect_id = ? AND status = 'recorded'",
            (defect_id,),
        )
    elif status == "completed":
        conn.execute(
            "UPDATE defect_items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE defect_id = ?",
            (status, defect_id),
        )
    elif status == "on_review":
        conn.execute(
            "UPDATE defect_items SET status = 'on_review', updated_at = CURRENT_TIMESTAMP WHERE defect_id = ? AND status != 'completed'",
            (defect_id,),
        )
    conn.commit()
    conn.close()
    
    return {"message": "Статус обновлен"}


@app.put("/api/defects/{defect_id}/comment-text")
async def update_defect_comment_text(defect_id: int, comment_text: str = Form("")):
    conn = get_db()
    defect = conn.execute("SELECT id FROM defects WHERE id = ?", (defect_id,)).fetchone()
    if not defect:
        conn.close()
        raise HTTPException(status_code=404, detail="Замечание не найдено")

    conn.execute(
        "UPDATE defects SET comment_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ((comment_text or "").strip(), defect_id),
    )
    conn.commit()
    conn.close()

    return {"message": "Комментарий замечания обновлен"}


@app.put("/api/defects/{defect_id}/restoration")
async def update_defect_restoration(defect_id: int, restoration: int = Form(...)):
    conn = get_db()
    defect = conn.execute("SELECT id, status, category, window_number FROM defects WHERE id = ?", (defect_id,)).fetchone()
    if not defect:
        conn.close()
        raise HTTPException(status_code=404, detail="Замечание не найдено")

    normalized_restoration = 1 if restoration else 0
    conn.execute(
        "UPDATE defects SET restoration = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (normalized_restoration, defect_id),
    )
    conn.commit()
    conn.close()

    return {"message": "Признак реставрации обновлен", "restoration": normalized_restoration}


@app.put("/api/defects/{defect_id}/restoration-completed")
async def update_defect_restoration_completed(defect_id: int, completed: int = Form(...)):
    conn = get_db()
    defect = conn.execute("SELECT id, restoration FROM defects WHERE id = ?", (defect_id,)).fetchone()
    if not defect:
        conn.close()
        raise HTTPException(status_code=404, detail="Замечание не найдено")

    normalized_completed = 1 if completed and defect["restoration"] else 0
    conn.execute(
        "UPDATE defects SET restoration_completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (normalized_completed, defect_id),
    )
    conn.commit()
    conn.close()

    return {"message": "Признак выполнения реставрации обновлен", "restoration_completed": normalized_completed}


@app.get("/api/defects/{defect_id}")
async def get_defect(defect_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM defects WHERE id = ?", (defect_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Замечание не найдено")
    
    d = dict(row)
    photos = [dict(p) for p in conn.execute(
        "SELECT id, filename, photo_type, item_id FROM photos WHERE defect_id = ? ORDER BY id",
        (defect_id,)
    ).fetchall()]
    d["photos"] = [photo for photo in photos if not photo.get("item_id")]
    items = [dict(item) for item in conn.execute(
        "SELECT * FROM defect_items WHERE defect_id = ? ORDER BY sort_order, id",
        (defect_id,)
    ).fetchall()]
    for item in items:
        item["photos"] = [photo for photo in photos if photo.get("item_id") == item["id"]]
    d["items"] = items
    
    conn.close()
    return d


@app.put("/api/defects/{defect_id}/meta")
async def update_defect_meta(
    defect_id: int,
    contractor_id: str = Form(None),
    contractor_name: str = Form(""),
    description: str = Form(""),
    defect_items_json: str = Form(""),
    window_number: Optional[str] = Form(None),
    variant_number: str = Form(""),
    project_name: str = Form(""),
    materials_info: str = Form(""),
    cost_amount: str = Form(""),
    labor_cost: str = Form(""),
    comment_text: str = Form(""),
    deadline: str = Form(None),
    executor: str = Form(""),
    restoration: int = Form(0),
    photos: List[UploadFile] = File(default=[]),
    photo_types: List[str] = Form(default=[]),
    photo_item_keys: List[str] = Form(default=[])
):
    conn = get_db()
    defect = conn.execute("SELECT id, category, window_number FROM defects WHERE id = ?", (defect_id,)).fetchone()
    if not defect:
        conn.close()
        raise HTTPException(status_code=404, detail="Замечание не найдено")

    resolved_contractor_id = int(contractor_id) if contractor_id else None
    resolved_contractor_name = ""
    if contractor_name.strip():
        resolved_contractor_id, resolved_contractor_name = ensure_contractor(conn, contractor_name)
    elif resolved_contractor_id:
        contractor = conn.execute("SELECT id, name FROM contractors WHERE id = ?", (resolved_contractor_id,)).fetchone()
        if not contractor:
            conn.close()
            raise HTTPException(status_code=404, detail="Подрядчик не найден")
        resolved_contractor_id = contractor["id"]
        resolved_contractor_name = contractor["name"]

    normalized_window_number = None
    if window_number is not None:
        normalized_window_number = window_number.strip()
        if normalized_window_number:
            try:
                normalized_window_number = int(normalized_window_number)
            except ValueError:
                conn.close()
                raise HTTPException(status_code=400, detail="Номер окна должен быть числом")
        else:
            normalized_window_number = None

    normalized_variant_number = variant_number.strip()
    if description is None:
        description = ""

    defect_items = parse_defect_items_payload(defect_items_json)
    if not defect_items:
        defect_items = [{"id": None, "key": "legacy-0", "text": line} for line in normalize_defect_text_lines(description)]
    if not defect_items:
        conn.close()
        raise HTTPException(status_code=400, detail="Нужно добавить хотя бы один пункт замечания")

    normalized_description = "\n".join(item["text"] for item in defect_items)

    current_category = defect["category"] if defect else ""
    if current_category == "Двери":
        if normalized_variant_number not in {"Межкомнатная", "Входная"}:
            conn.close()
            raise HTTPException(status_code=400, detail="Для двери нужно выбрать Межкомнатная или Входная.")
    else:
        normalized_variant_number = ""

    if current_category == "Окна" and normalized_window_number is None:
        normalized_window_number = defect["window_number"]

    next_defect_status = 'in_progress'

    conn.execute(
        """
        UPDATE defects
        SET contractor_id = ?, contractor_name = ?, description = ?, variant_number = ?, project_name = ?,
            materials_info = ?, cost_amount = ?, labor_cost = ?, comment_text = ?, deadline = ?, window_number = ?,
            executor = ?, restoration = ?, status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (
            resolved_contractor_id,
            resolved_contractor_name,
            normalized_description,
            normalized_variant_number,
            project_name.strip(),
            materials_info.strip(),
            cost_amount.strip(),
            labor_cost.strip(),
            comment_text.strip(),
            deadline,
            normalized_window_number,
            executor.strip(),
            restoration,
            next_defect_status,
            defect_id
        )
    )

    existing_items = {
        row["id"]: row
        for row in conn.execute(
            "SELECT id, status FROM defect_items WHERE defect_id = ? ORDER BY sort_order, id",
            (defect_id,)
        ).fetchall()
    }
    kept_item_ids = set()
    item_key_to_id = {}

    for index, item in enumerate(defect_items):
        item_id = item.get("id")
        if item_id in existing_items:
            conn.execute(
                "UPDATE defect_items SET text = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (item["text"], index, item_id)
            )
            kept_item_ids.add(item_id)
            item_key_to_id[item["key"]] = item_id
            continue

        cursor = conn.execute(
            "INSERT INTO defect_items (defect_id, text, status, sort_order) VALUES (?, ?, ?, ?)",
            (defect_id, item["text"], 'recorded', index)
        )
        item_key_to_id[item["key"]] = cursor.lastrowid

    removed_items = [item_id for item_id in existing_items if item_id not in kept_item_ids]
    for item_id in removed_items:
        removed_photos = conn.execute("SELECT filename FROM photos WHERE item_id = ?", (item_id,)).fetchall()
        for photo in removed_photos:
            file_path = UPLOAD_DIR / photo["filename"]
            if file_path.exists():
                file_path.unlink()
        conn.execute("DELETE FROM photos WHERE item_id = ?", (item_id,))
        conn.execute("DELETE FROM defect_items WHERE id = ?", (item_id,))

    sync_defect_description_from_items(conn, defect_id)
    sync_defect_in_progress_status_from_items(conn, defect_id)
    
    # Handle new photos
    for idx, photo in enumerate(photos):
        if photo.filename:
            ext = resolve_upload_extension(photo, DEFECT_UPLOAD_EXTENSIONS)
            if not ext:
                continue
            
            unique_name = f"{uuid.uuid4().hex}{ext}"
            file_path = UPLOAD_DIR / unique_name
            
            with open(file_path, "wb") as f:
                content = await photo.read()
                f.write(content)
            
            photo_type = photo_types[idx] if idx < len(photo_types) else 'before'
            photo_item_key = photo_item_keys[idx] if idx < len(photo_item_keys) else ''
            photo_item_id = item_key_to_id.get(photo_item_key)
            conn.execute(
                "INSERT INTO photos (defect_id, item_id, filename, original_name, photo_type) VALUES (?, ?, ?, ?, ?)",
                (defect_id, photo_item_id, unique_name, photo.filename, photo_type)
            )
    
    conn.commit()
    conn.close()

    return {"message": "Данные замечания обновлены"}


@app.delete("/api/defects/{defect_id}")
async def delete_defect(defect_id: int):
    conn = get_db()
    
    # Удаляем фото
    photos = conn.execute("SELECT filename FROM photos WHERE defect_id = ?", (defect_id,)).fetchall()
    for photo in photos:
        file_path = UPLOAD_DIR / photo["filename"]
        if file_path.exists():
            file_path.unlink()
    item_ids = [row[0] for row in conn.execute("SELECT id FROM defect_items WHERE defect_id = ?", (defect_id,)).fetchall()]
    if item_ids:
        placeholders = ",".join("?" for _ in item_ids)
        conn.execute(f"DELETE FROM item_comments WHERE item_id IN ({placeholders})", item_ids)
        conn.execute(f"DELETE FROM defect_items WHERE id IN ({placeholders})", item_ids)

    conn.execute("DELETE FROM comments WHERE defect_id = ?", (defect_id,))
    conn.execute("DELETE FROM photos WHERE defect_id = ?", (defect_id,))
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
    valid_statuses = ['available', 'owner_accepted', 'call', 'no_access', 'by_phone', 'elevated', 'in_progress', 'complex']
    if access_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Неверный статус доступа")
    
    conn = get_db()
    cur = conn.execute("SELECT access_status, access_phone, access_comment FROM apartments WHERE id = ?", (apartment_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Квартира не найдена")

    existing_status = row[0]
    existing_phone = row[1]
    existing_comment = row[2]
    
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

    if existing_status != access_status:
        conn.execute(
            "INSERT INTO apartment_status_history (apartment_id, old_status, new_status) VALUES (?, ?, ?)",
            (apartment_id, existing_status, access_status),
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


@app.get("/api/contractors")
async def get_contractors():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, name, created_at FROM contractors ORDER BY lower(name), id"
    ).fetchall()
    conn.close()
    return {"contractors": [dict(row) for row in rows]}


@app.post("/api/contractors")
async def create_contractor(name: str = Form(...)):
    conn = get_db()
    contractor_id, contractor_name = ensure_contractor(conn, name)
    conn.commit()
    conn.close()
    return {"id": contractor_id, "name": contractor_name}


@app.get("/api/templates/{category}")
async def get_templates(category: str):
    if category not in TEMPLATES:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    return {"category": category, "templates": TEMPLATES[category]}


def parse_stats_period(stat_date: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    today = date.today()

    if start_date or end_date:
        try:
            period_start = datetime.strptime(start_date or end_date, "%Y-%m-%d").date()
            period_end = datetime.strptime(end_date or start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Некорректный формат даты")

        if period_start > period_end:
            period_start, period_end = period_end, period_start

        return {
            "mode": "range",
            "start": period_start,
            "end": period_end,
            "today": today,
        }

    if stat_date:
        try:
            period_date = datetime.strptime(stat_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Некорректный формат даты")
    else:
        period_date = today

    return {
        "mode": "day",
        "start": period_date,
        "end": period_date,
        "today": today,
    }


def build_complex_statistics(conn, complex_id: int, stat_date: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    period = parse_stats_period(stat_date, start_date, end_date)
    period_start = period["start"]
    period_end = period["end"]

    complex_row = conn.execute("SELECT name, property_type FROM complexes WHERE id = ?", (complex_id,)).fetchone()
    if not complex_row:
        raise HTTPException(status_code=404, detail="ЖК не найден")

    first_defect = conn.execute(
        """
        SELECT MIN(date(d.created_at)) as first_date
        FROM defects d
        JOIN apartments a ON d.apartment_id = a.id
        WHERE a.complex_id = ?
        """,
        (complex_id,),
    ).fetchone()

    first_defect_date = first_defect[0] if first_defect and first_defect[0] else str(period["today"])

    total = conn.execute(
        "SELECT COUNT(*) FROM apartments WHERE complex_id = ?",
        (complex_id,),
    ).fetchone()[0]

    with_defects = conn.execute(
        """
        SELECT COUNT(DISTINCT a.id)
        FROM apartments a
        JOIN defects d ON a.id = d.apartment_id
        WHERE a.complex_id = ?
          AND a.access_status NOT IN ('owner_accepted', 'tech_accepted')
          AND d.status NOT IN ('completed', 'rejected', 'on_review')
        """,
        (complex_id,),
    ).fetchone()[0]

    all_time_defects = conn.execute(
        """
        SELECT COUNT(*)
        FROM defects d
        JOIN apartments a ON d.apartment_id = a.id
        WHERE a.complex_id = ?
        """,
        (complex_id,),
    ).fetchone()[0]

    all_time_apartments_with_defects = conn.execute(
        """
        SELECT COUNT(DISTINCT a.id)
        FROM apartments a
        JOIN defects d ON a.id = d.apartment_id
        WHERE a.complex_id = ?
        """,
        (complex_id,),
    ).fetchone()[0]

    period_defects = conn.execute(
        """
        SELECT COUNT(*)
        FROM defects d
        JOIN apartments a ON d.apartment_id = a.id
        WHERE a.complex_id = ?
          AND date(d.created_at) BETWEEN ? AND ?
        """,
        (complex_id, period_start.isoformat(), period_end.isoformat()),
    ).fetchone()[0]

    period_open_defects = conn.execute(
        """
        SELECT COUNT(*)
        FROM defects d
        JOIN apartments a ON d.apartment_id = a.id
        WHERE a.complex_id = ?
          AND d.status NOT IN ('completed', 'rejected', 'on_review')
          AND date(d.created_at) BETWEEN ? AND ?
        """,
        (complex_id, period_start.isoformat(), period_end.isoformat()),
    ).fetchone()[0]

    period_apartments_with_defects = conn.execute(
        """
        SELECT COUNT(DISTINCT a.id)
        FROM apartments a
        JOIN defects d ON a.id = d.apartment_id
        WHERE a.complex_id = ?
          AND d.status NOT IN ('completed', 'rejected', 'on_review')
          AND date(d.created_at) BETWEEN ? AND ?
        """,
        (complex_id, period_start.isoformat(), period_end.isoformat()),
    ).fetchone()[0]

    access_status_stats = conn.execute(
        """
        SELECT a.access_status, COUNT(*) as count
        FROM apartments a
        WHERE a.complex_id = ?
        GROUP BY a.access_status
        """,
        (complex_id,),
    ).fetchall()

    by_access_status = []
    for row in access_status_stats:
        count = row[1]
        percentage = round((count / total) * 100, 1) if total else 0
        by_access_status.append({
            "access_status": row[0],
            "count": count,
            "percentage": percentage,
        })

    status_change_stats = conn.execute(
        """
        SELECT h.new_status, COUNT(*) as count
        FROM apartment_status_history h
        JOIN apartments a ON h.apartment_id = a.id
        WHERE a.complex_id = ?
          AND date(h.created_at) BETWEEN ? AND ?
        GROUP BY h.new_status
        """,
        (complex_id, period_start.isoformat(), period_end.isoformat()),
    ).fetchall()

    period_status_changes = []
    for row in status_change_stats:
        count = row[1]
        percentage = round((count / total) * 100, 1) if total else 0
        period_status_changes.append({
            "access_status": row[0],
            "count": count,
            "percentage": percentage,
        })

    tracked_statuses = ["owner_accepted", "tech_accepted", "no_access", "call"]
    status_period_net = {status: 0 for status in tracked_statuses}
    movement_rows = conn.execute(
        """
        SELECT old_status, new_status
        FROM apartment_status_history h
        JOIN apartments a ON h.apartment_id = a.id
        WHERE a.complex_id = ?
          AND date(h.created_at) BETWEEN ? AND ?
        """,
        (complex_id, period_start.isoformat(), period_end.isoformat()),
    ).fetchall()

    for row in movement_rows:
        old_status = row["old_status"]
        new_status = row["new_status"]
        if old_status in status_period_net:
            status_period_net[old_status] -= 1
        if new_status in status_period_net:
            status_period_net[new_status] += 1

    defect_apartment_rows = conn.execute(
        """
        SELECT
            a.id AS apartment_id,
            COALESCE(a.access_status, '') AS access_status,
            MIN(date(d.created_at)) AS first_defect_date
        FROM apartments a
        JOIN defects d ON d.apartment_id = a.id
        WHERE a.complex_id = ?
        GROUP BY a.id, COALESCE(a.access_status, '')
        ORDER BY first_defect_date, a.id
        """,
        (complex_id,),
    ).fetchall()

    defect_apartment_total = len(defect_apartment_rows)
    accepted_statuses = {"owner_accepted", "tech_accepted"}
    today_call_count = sum(1 for row in defect_apartment_rows if row["access_status"] == "call")
    today_accepted_count = sum(1 for row in defect_apartment_rows if row["access_status"] in accepted_statuses)
    today_no_access_count = sum(1 for row in defect_apartment_rows if row["access_status"] == "no_access")
    today_remaining_with_defects = max(
        defect_apartment_total - today_call_count - today_accepted_count - today_no_access_count,
        0,
    )

    timeline = []
    if defect_apartment_rows:
        defect_start_by_date = {}
        current_status_by_apartment = {}
        for row in defect_apartment_rows:
            defect_start_by_date.setdefault(row["first_defect_date"], []).append(row["apartment_id"])
            current_status_by_apartment[row["apartment_id"]] = row["access_status"]

        active_apartments = set()
        cursor_date = datetime.strptime(first_defect_date, "%Y-%m-%d").date()

        while cursor_date <= period["today"]:
            day_key = cursor_date.isoformat()

            for apartment_id in defect_start_by_date.get(day_key, []):
                active_apartments.add(apartment_id)

            day_with_defects = len(active_apartments)
            day_call = sum(1 for apartment_id in active_apartments if current_status_by_apartment.get(apartment_id) == "call")
            day_accepted = sum(1 for apartment_id in active_apartments if current_status_by_apartment.get(apartment_id) in accepted_statuses)
            day_no_access = sum(1 for apartment_id in active_apartments if current_status_by_apartment.get(apartment_id) == "no_access")

            timeline.append({
                "date": day_key,
                "call": day_call,
                "accepted": day_accepted,
                "no_access": day_no_access,
                "with_defects": day_with_defects,
                "remaining_with_defects": max(day_with_defects - day_call - day_accepted - day_no_access, 0),
            })

            cursor_date += timedelta(days=1)

    today_metrics = {
        "call": today_call_count,
        "accepted": today_accepted_count,
        "no_access": today_no_access_count,
        "with_defects": defect_apartment_total,
        "remaining_with_defects": today_remaining_with_defects,
    }

    return {
        "complex_name": complex_row["name"],
        "property_type": complex_row["property_type"] or "квартиры",
        "total_apartments": total,
        "with_defects": with_defects,
        "without_defects": total - with_defects,
        "all_time_defects": all_time_defects,
        "all_time_apartments_with_defects": all_time_apartments_with_defects,
        "period_defects": period_defects,
        "period_open_defects": period_open_defects,
        "period_apartments_with_defects": period_apartments_with_defects,
        "by_access_status": by_access_status,
        "period_status_changes": period_status_changes,
        "status_period_net": status_period_net,
        "first_defect_date": first_defect_date,
        "period_mode": period["mode"],
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "today_metrics": today_metrics,
        "timeline": timeline,
    }


def build_stats_chart_drawing(timeline, font_name='Helvetica'):
    width = 500
    height = 240
    drawing = Drawing(width, height)
    if not timeline:
        drawing.add(String(width / 2, height / 2, 'Нет данных для графика', textAnchor='middle', fontName=font_name, fontSize=11, fillColor=colors.HexColor('#64748b')))
        return drawing

    series = [
        ('remaining_with_defects', 'Остаток с замечаниями', colors.HexColor('#e60042')),
        ('with_defects', 'С замечаниями', colors.HexColor('#111111')),
        ('call', 'Вызов', colors.HexColor('#e969a8')),
        ('accepted', 'Принято', colors.HexColor('#009d91')),
        ('no_access', 'Нет доступа', colors.HexColor('#64748b')),
    ]
    pad_left = 38
    pad_right = 16
    pad_top = 18
    pad_bottom = 34
    inner_width = width - pad_left - pad_right
    inner_height = height - pad_top - pad_bottom
    max_value = max(1, max(int(point.get(key, 0) or 0) for point in timeline for key, _, _ in series))
    steps = 4

    def to_x(index):
        return pad_left if len(timeline) == 1 else pad_left + (inner_width * index / (len(timeline) - 1))

    def to_y(value):
        return pad_top + inner_height - ((float(value or 0) / max_value) * inner_height)

    for step in range(steps + 1):
        y = pad_top + inner_height - (inner_height * step / steps)
        label = str(round(max_value * step / steps))
        drawing.add(Line(pad_left, y, width - pad_right, y, strokeColor=colors.HexColor('#e2e8f0'), strokeWidth=1))
        drawing.add(String(pad_left - 8, y - 3, label, textAnchor='end', fontName=font_name, fontSize=9, fillColor=colors.HexColor('#64748b')))

    for key, _, color in series:
        points = []
        for index, point in enumerate(timeline):
            x = to_x(index)
            y = to_y(point.get(key, 0))
            points.extend([x, y])
        drawing.add(PolyLine(points, strokeColor=color, strokeWidth=2.5, strokeLineCap=1, strokeLineJoin=1, fillColor=None))
        drawing.add(Circle(points[-2], points[-1], 2.8, strokeColor=color, fillColor=color))

    first_date = datetime.strptime(timeline[0]['date'], '%Y-%m-%d').strftime('%d.%m')
    mid_date = datetime.strptime(timeline[len(timeline) // 2]['date'], '%Y-%m-%d').strftime('%d.%m')
    last_date = datetime.strptime(timeline[-1]['date'], '%Y-%m-%d').strftime('%d.%m')
    drawing.add(String(pad_left, 8, first_date, textAnchor='start', fontName=font_name, fontSize=9, fillColor=colors.HexColor('#64748b')))
    drawing.add(String(width / 2, 8, mid_date, textAnchor='middle', fontName=font_name, fontSize=9, fillColor=colors.HexColor('#64748b')))
    drawing.add(String(width - pad_right, 8, last_date, textAnchor='end', fontName=font_name, fontSize=9, fillColor=colors.HexColor('#64748b')))

    legend_y = height - 6
    legend_x = pad_left
    for _, label, color in series:
        drawing.add(Rect(legend_x, legend_y, 8, 8, strokeColor=color, fillColor=color))
        drawing.add(String(legend_x + 12, legend_y + 1, label, fontName=font_name, fontSize=8.5, fillColor=colors.HexColor('#334155')))
        legend_x += 92

    return drawing


@app.get("/api/complexes/{complex_id}/statistics")
async def get_complex_statistics(complex_id: int, stat_date: str = None, start_date: str = None, end_date: str = None):
    conn = get_db()
    try:
        return build_complex_statistics(conn, complex_id, stat_date, start_date, end_date)
    finally:
        conn.close()


@app.get("/api/complexes/{complex_id}/statistics/pdf")
async def export_complex_statistics_pdf(complex_id: int, stat_date: str = None, start_date: str = None, end_date: str = None):
    conn = get_db()
    try:
        stats = build_complex_statistics(conn, complex_id, stat_date, start_date, end_date)
    finally:
        conn.close()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.5 * cm, bottomMargin=1.5 * cm)

    try:
        pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
        pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
        font_name = 'DejaVuSans'
        font_bold = 'DejaVuSans-Bold'
    except Exception:
        font_name = 'Helvetica'
        font_bold = 'Helvetica-Bold'

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name='StatsBody',
        fontName=font_name,
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#111111'),
    ))
    styles.add(ParagraphStyle(
        name='StatsTitle',
        fontName=font_bold,
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#111111'),
    ))
    styles.add(ParagraphStyle(
        name='StatsMeta',
        fontName=font_name,
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#4b5563'),
    ))

    story = []

    period_label = f'{stats["first_defect_date"]} - {date.today().isoformat()}'
    property_label = 'Апартаментов' if stats.get('property_type') == 'апартаменты' else 'Квартир'
    today_metrics = stats.get("today_metrics", {})

    story.append(Paragraph(stats["complex_name"], styles['StatsTitle']))
    story.append(Spacer(1, 0.15 * cm))
    story.append(Paragraph(f'Период: {period_label}', styles['StatsMeta']))
    story.append(Spacer(1, 0.45 * cm))

    summary_data = [
        [property_label, str(stats["total_apartments"])],
        ["Сегодня", date.today().isoformat()],
    ]
    summary_table = Table(summary_data, colWidths=[10.5 * cm, 4.5 * cm])
    summary_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), font_name),
        ('FONTNAME', (1, 0), (1, -1), font_bold),
        ('FONTSIZE', (0, 0), (0, -1), 11),
        ('FONTSIZE', (1, 0), (1, -1), 18),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#111111')),
        ('BACKGROUND', (0, 0), (-1, -1), colors.white),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.45 * cm))

    rows = [["Статус", "Количество", "% от общего"]]
    status_rows = [
        ("Вызов", today_metrics.get("call", 0)),
        ("Принято", today_metrics.get("accepted", 0)),
        ("Нет доступа", today_metrics.get("no_access", 0)),
        ("Остаток с замечаниями", today_metrics.get("remaining_with_defects", 0)),
        ("С замечаниями", today_metrics.get("with_defects", 0)),
    ]
    total_apartments = stats["total_apartments"] or 0
    for label, count in status_rows:
        percent = round((count / total_apartments) * 100, 1) if total_apartments else 0
        rows.append([label, str(count), f'{percent}%'])

    status_table = Table(rows, colWidths=[8.5 * cm, 3 * cm, 3 * cm])
    status_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), font_name),
        ('FONTNAME', (0, 0), (-1, 0), font_bold),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#111111')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('LINEBELOW', (0, 1), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
        ('TOPPADDING', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
    ]))
    story.append(status_table)
    story.append(Spacer(1, 0.45 * cm))
    story.append(Paragraph('График за все время', styles['StatsMeta']))
    story.append(Spacer(1, 0.2 * cm))
    story.append(build_stats_chart_drawing(stats.get('timeline', []), font_name=font_name))

    doc.build(story)
    buffer.seek(0)
    filename = f'statistics_{complex_id}.pdf'
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(buffer, media_type='application/pdf', headers=headers)


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
    cleaned_text = text.strip()
    cleaned_author = author.strip() or "Пользователь"
    if not cleaned_text:
        raise HTTPException(status_code=400, detail="Комментарий не может быть пустым")

    conn = get_db()
    defect = conn.execute("SELECT id FROM defects WHERE id = ?", (defect_id,)).fetchone()
    if not defect:
        conn.close()
        raise HTTPException(status_code=404, detail="Замечание не найдено")
    
    cursor = conn.execute(
        "INSERT INTO comments (defect_id, author, text) VALUES (?, ?, ?)",
        (defect_id, cleaned_author, cleaned_text)
    )
    comment_id = cursor.lastrowid
    
    # Сохраняем фото комментария
    for photo in photos:
        if photo.filename:
            ext = resolve_upload_extension(photo, COMMENT_UPLOAD_EXTENSIONS)
            if not ext:
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


@app.put("/api/comments/{comment_id}")
async def update_comment(
    comment_id: int,
    text: str = Form(...),
    author: str = Form(...),
):
    cleaned_text = text.strip()
    cleaned_author = author.strip()
    if not cleaned_text:
        raise HTTPException(status_code=400, detail="Комментарий не может быть пустым")
    if not cleaned_author:
        raise HTTPException(status_code=400, detail="Автор не указан")

    conn = get_db()
    comment = conn.execute("SELECT id, author FROM comments WHERE id = ?", (comment_id,)).fetchone()
    if not comment:
        conn.close()
        raise HTTPException(status_code=404, detail="Комментарий не найден")
    if (comment["author"] or "").strip() != cleaned_author:
        conn.close()
        raise HTTPException(status_code=403, detail="Редактировать комментарий может только автор")

    conn.execute(
        "UPDATE comments SET text = ? WHERE id = ?",
        (cleaned_text, comment_id),
    )
    conn.commit()
    conn.close()

    return {"message": "Комментарий обновлен"}


@app.delete("/api/comments/{comment_id}")
async def delete_comment(comment_id: int):
    conn = get_db()
    comment = conn.execute("SELECT id FROM comments WHERE id = ?", (comment_id,)).fetchone()
    if not comment:
        conn.close()
        raise HTTPException(status_code=404, detail="Комментарий не найден")
    
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
        ["Статус", "Значение"],
        ["Всего замечаний", str(total_defects)],
        ["Зафиксированно", str(by_status.get('recorded', 0))],
        ["В работе", str(by_status.get('in_progress', 0))],
        ["На проверке", str(by_status.get('on_review', 0))],
        ["Выполнено", str(by_status.get('completed', 0))],
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
