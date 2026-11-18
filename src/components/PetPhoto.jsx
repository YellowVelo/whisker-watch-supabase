import { useEffect, useState } from 'react';
import { getSignedUrl } from '@/api/storageClient';

/**
 * A pet's photo from private storage (spec 0071).
 *
 * Pass the stored path (pets.photo_path). The photo is shown through a
 * short-lived signed link. While the link loads, if there's no photo, or if
 * the viewer isn't allowed to open it, `fallback` is shown instead (the
 * screen's usual species icon or placeholder), so the layout never jumps.
 *
 * The caller keeps its own sizing/rounded container; this only decides
 * what goes inside it.
 */
export default function PetPhoto({ photoPath, alt = '', className = '', fallback = null }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!photoPath) return undefined;
    getSignedUrl(photoPath).then((signed) => {
      if (!cancelled) setUrl(signed);
    });
    return () => { cancelled = true; };
  }, [photoPath]);

  if (!photoPath || !url) return fallback;
  return <img src={url} alt={alt} className={className} data-testid="pet-photo" />;
}
