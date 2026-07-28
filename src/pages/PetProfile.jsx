import { useParams, Navigate } from 'react-router-dom';

// The standalone /pet/:petId page is retired (spec 0023 step 10) — its
// content (PetProfileContent) is the same component already shown inline
// on Pets via ExpandablePetProfileCard, which is now the single canonical
// place to see it. This route stays alive purely as a compatibility
// redirect for any old bookmark/link, landing on Pets with the pet's card
// scrolled into view (collapsed, not expanded).
export default function PetProfile() {
  const { petId } = useParams();
  return <Navigate to={`/pets?highlight=${petId}`} replace />;
}
