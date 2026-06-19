export interface SelectedImage {
  id: string;
  file: File;
  localUrl: string;
  approved: boolean;
}

export type JobStatus = 'uploading' | 'pending' | 'processing' | 'done' | 'error';
export type ImageStatus = 'pending' | 'processing' | 'done' | 'error';
export type OutputFormat = 'png' | 'jpg';

export interface JobImageRow {
  id: string;
  job_id: string;
  image_index: number;
  original_path: string;
  result_path: string | null;
  nas_path: string | null;
  file_name: string | null;
  status: ImageStatus | null;
  processed_at: string | null;
  preview_expires_at: string | null;
  storage_deleted_at: string | null;
  error: string | null;
}

export interface JobRow {
  id: string;
  product_code: string;
  final_code: string | null;
  margin_percentage: number | null;
  output_format: OutputFormat | null;
  status: JobStatus;
  created_at: string;
  processed_at: string | null;
  error: string | null;
  created_by: string | null;
  job_images?: JobImageRow[];
}
