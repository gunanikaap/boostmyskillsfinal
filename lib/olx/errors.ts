export type OlxErrorCode =
  | "invalid_archive"
  | "compressed_too_large"
  | "expanded_too_large"
  | "too_many_files"
  | "file_too_large"
  | "path_traversal"
  | "absolute_path"
  | "windows_drive_path"
  | "symlink"
  | "hardlink"
  | "special_file"
  | "duplicate_path"
  | "unsupported";

export class OlxArchiveError extends Error {
  readonly code: OlxErrorCode;
  constructor(code: OlxErrorCode, message: string) {
    super(message);
    this.name = "OlxArchiveError";
    this.code = code;
  }
}
