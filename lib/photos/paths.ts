/** Storage bucket for item photos (private; see the storage migration). */
export const PHOTO_BUCKET = "item-photos";

export const MAX_PHOTOS = 10;

/** Main photo: {user_id}/{item_id}/{photo_uuid}.jpg (format enforced by a DB check). */
export function photoPath(userId: string, itemId: string, photoId: string) {
  return `${userId}/${itemId}/${photoId}.jpg`;
}

/** Thumbnail stored next to the main file: {photo_uuid}.thumb.jpg. Only the main path is in the DB. */
export function thumbPath(mainPath: string) {
  return mainPath.replace(/\.jpg$/, ".thumb.jpg");
}

/** Both files of a photo: deleting a photo always deletes the pair. */
export function photoFiles(mainPath: string) {
  return [mainPath, thumbPath(mainPath)];
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** A main photo path that belongs to this user and item. */
export function isOwnPhotoPath(path: string, userId: string, itemId: string) {
  return new RegExp(`^${userId}/${itemId}/${UUID}\\.jpg$`).test(path) && !path.endsWith(".thumb.jpg");
}
