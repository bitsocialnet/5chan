const CATBOX_API = 'https://catbox.moe/user/api.php';

/**
 * Upload a file to catbox.moe.
 * @param file - The file to upload
 * @returns The URL of the uploaded file
 * @throws Error when the response is not ok
 */
export async function uploadToCatbox(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', file);

  const response = await fetch(CATBOX_API, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  return text.trim();
}
