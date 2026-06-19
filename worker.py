from pathlib import Path
from PIL import Image
from rembg import remove, new_session
from supabase import create_client
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta
import tempfile
import time
import io
import os

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = os.environ.get("SUPABASE_BUCKET", "product-images")
NAS_OUTPUT_DIR = Path(os.environ.get("NAS_OUTPUT_DIR", "/data/processed"))

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

CANVAS_SIZE = 1000
MARGIN_PERCENTAGE = 10
PREVIEW_MINUTES = int(os.environ.get("PREVIEW_MINUTES", "10"))

# High quality model. If it is too slow, change to: new_session("u2net")
SESSION = new_session("birefnet-general")


def safe_filename(value: str) -> str:
    value = str(value).strip()
    forbidden_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']

    for char in forbidden_chars:
        value = value.replace(char, '-')

    return value or "unknown"


def remove_background(input_path: Path) -> Image.Image:
    with open(input_path, "rb") as f:
        input_bytes = f.read()

    output_bytes = remove(input_bytes, session=SESSION)
    return Image.open(io.BytesIO(output_bytes)).convert("RGBA")


def crop_transparent_content(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()

    if not bbox:
        raise ValueError("Prodotto non rilevato dopo rembg.")

    left, top, right, bottom = bbox

    if right - left <= 0 or bottom - top <= 0:
        raise ValueError("Bounding box non valida dopo rembg.")

    return image.crop(bbox)


def place_on_1000_canvas(image: Image.Image, margin_percentage: int) -> Image.Image:
    margin_percentage = max(0, min(40, int(margin_percentage)))
    margin = int(CANVAS_SIZE * margin_percentage / 100)
    inner_size = CANVAS_SIZE - margin * 2

    product = image.copy()
    product.thumbnail((inner_size, inner_size), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (255, 255, 255, 0))

    x = (CANVAS_SIZE - product.width) // 2
    y = (CANVAS_SIZE - product.height) // 2

    canvas.paste(product, (x, y), product)
    return canvas


def process_single_image(input_path: Path, output_path: Path, margin_percentage: int, output_format: str):
    no_bg = remove_background(input_path)
    cropped = crop_transparent_content(no_bg)
    final_image = place_on_1000_canvas(cropped, margin_percentage)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if output_format == "jpg":
        white_background = Image.new("RGBA", final_image.size, (255, 255, 255, 255))
        white_background.paste(final_image, (0, 0), final_image)
        white_background.convert("RGB").save(output_path, "JPEG", quality=95, optimize=True)
    else:
        final_image.save(output_path, "PNG", optimize=True)


def get_pending_job():
    response = (
        supabase
        .table("jobs")
        .select("*")
        .eq("status", "pending")
        .order("created_at")
        .limit(1)
        .execute()
    )

    if not response.data:
        return None

    return response.data[0]


def get_job_images(job_id: str):
    response = (
        supabase
        .table("job_images")
        .select("*")
        .eq("job_id", job_id)
        .order("image_index")
        .execute()
    )

    return response.data or []


def update_job(job_id: str, data: dict):
    supabase.table("jobs").update(data).eq("id", job_id).execute()


def update_job_image(image_id: str, data: dict):
    supabase.table("job_images").update(data).eq("id", image_id).execute()


def download_storage_file(storage_path: str, local_path: Path):
    data = supabase.storage.from_(BUCKET).download(storage_path)

    with open(local_path, "wb") as f:
        f.write(data)


def upload_processed_to_supabase(local_path: Path, storage_path: str, output_format: str):
    with open(local_path, "rb") as f:
        file_bytes = f.read()

    content_type = "image/jpeg" if output_format == "jpg" else "image/png"

    try:
        supabase.storage.from_(BUCKET).upload(
            path=storage_path,
            file=file_bytes,
            file_options={
                "content-type": content_type,
                "upsert": "true",
            },
        )
    except Exception:
        try:
            supabase.storage.from_(BUCKET).remove([storage_path])
        except Exception:
            pass

        supabase.storage.from_(BUCKET).upload(
            path=storage_path,
            file=file_bytes,
            file_options={
                "content-type": content_type,
            },
        )


def delete_originals_from_supabase(paths: list[str]):
    if not paths:
        return

    print("Elimino originali da Supabase Storage...")

    try:
        supabase.storage.from_(BUCKET).remove(paths)
        print(f"Originali eliminati: {len(paths)}")
    except Exception as e:
        print(f"Attenzione: impossibile eliminare alcuni originali: {e}")


def cleanup_expired_previews():
    now_iso = datetime.now(timezone.utc).isoformat()

    response = (
        supabase
        .table("job_images")
        .select("id,result_path")
        .not_.is_("result_path", "null")
        .not_.is_("preview_expires_at", "null")
        .is_("storage_deleted_at", "null")
        .lte("preview_expires_at", now_iso)
        .execute()
    )

    expired_images = response.data or []

    if not expired_images:
        return

    paths = [img["result_path"] for img in expired_images if img.get("result_path")]
    ids = [img["id"] for img in expired_images if img.get("id")]

    if paths:
        print(f"Elimino preview Supabase scadute: {len(paths)}")
        try:
            supabase.storage.from_(BUCKET).remove(paths)
        except Exception as e:
            print(f"Attenzione: impossibile eliminare alcune preview: {e}")

    if ids:
        print(f"Rimuovo righe preview scadute dalla lista: {len(ids)}")
        supabase.table("job_images").delete().in_("id", ids).execute()


def process_job(job: dict):
    job_id = job["id"]
    product_code = job["product_code"]
    final_code = safe_filename(job.get("final_code") or product_code)

    margin_percentage = int(job.get("margin_percentage") or MARGIN_PERCENTAGE)
    output_format = str(job.get("output_format") or "png").lower()

    if output_format not in ["png", "jpg"]:
        output_format = "png"

    extension = "jpg" if output_format == "jpg" else "png"

    print(f"\n=== PROCESSO JOB {job_id} ===")
    print(f"Codice originale scansionato: {product_code}")
    print(f"Codice pubblico/finale: {final_code}")
    print(f"Margine prodotto: {margin_percentage}%")
    print(f"Formato finale: {output_format}")

    update_job(job_id, {
        "status": "processing",
        "error": None,
    })

    images = get_job_images(job_id)

    if not images:
        raise ValueError("Nessuna immagine trovata per il job.")

    original_paths_to_delete = []
    image_errors = []

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)

        for img in images:
            image_index = img["image_index"]
            original_path = img["original_path"]

            try:
                update_job_image(img["id"], {
                    "status": "processing",
                    "error": None,
                })

                file_name = f"{final_code}-{image_index}.{extension}"
                result_path = f"processed/{file_name}"

                local_input = tmpdir_path / f"input-{image_index}.jpg"
                local_output = NAS_OUTPUT_DIR / file_name

                print(f"Scarico originale da Supabase: {original_path}")
                download_storage_file(original_path, local_input)

                print("Rimuovo sfondo e creo canvas 1000x1000...")
                process_single_image(local_input, local_output, margin_percentage, output_format)

                print(f"Salvato su NAS/PC: {local_output}")
                print(f"Carico preview temporanea su Supabase: {result_path}")
                upload_processed_to_supabase(local_output, result_path, output_format)

                preview_expires_at = datetime.now(timezone.utc) + timedelta(minutes=PREVIEW_MINUTES)

                update_job_image(img["id"], {
                    "status": "done",
                    "result_path": result_path,
                    "nas_path": str(local_output),
                    "file_name": file_name,
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                    "preview_expires_at": preview_expires_at.isoformat(),
                    "error": None,
                })

                original_paths_to_delete.append(original_path)

            except Exception as e:
                message = str(e)
                image_errors.append(message)
                print(f"Errore immagine {image_index}: {message}")
                update_job_image(img["id"], {
                    "status": "error",
                    "error": message,
                })

    delete_originals_from_supabase(original_paths_to_delete)

    if image_errors:
        update_job(job_id, {
            "status": "error",
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "error": " | ".join(image_errors),
        })
    else:
        update_job(job_id, {
            "status": "done",
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "error": None,
        })

    print(f"Job completato: {job_id}")


def mark_job_error(job_id: str, error: Exception):
    message = str(error)
    print(f"Errore job {job_id}: {message}")

    update_job(job_id, {
        "status": "error",
        "error": message,
    })


def main():
    print("Worker Supabase + NAS/PC rembg avviato.")
    print(f"Bucket Supabase: {BUCKET}")
    print(f"Output directory: {NAS_OUTPUT_DIR}")
    print(f"Preview Supabase: {PREVIEW_MINUTES} minuti")

    last_cleanup = 0

    while True:
        now = time.time()

        if now - last_cleanup >= 600:
            cleanup_expired_previews()
            last_cleanup = now

        job = get_pending_job()

        if not job:
            print("Nessun job pending...")
            time.sleep(5)
            continue

        try:
            process_job(job)
        except Exception as e:
            mark_job_error(job["id"], e)

        time.sleep(2)


if __name__ == "__main__":
    main()
