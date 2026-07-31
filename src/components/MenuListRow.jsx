import ListRow from './ListRow';

// Thin wrapper kept for call-site compatibility (Settings.jsx) — the real
// implementation is the canonical ListRow (Design System Amendment #8,
// 2026-07-30), which also replaces PetProfileContent.jsx's NavCard.
export default function MenuListRow(props) {
  return <ListRow standalone={false} {...props} />;
}
