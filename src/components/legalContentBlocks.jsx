// Shared rendering for legal-document detail screens (Terms of Service,
// Privacy Policy) — both documents share the same paragraph/bullet-list
// body shape, so they share this one copy instead of each defining it.

// Renders a body link: mailto: links stay in-tab, external http(s) links
// open in a new tab (leaving the app while reading legal text shouldn't
// lose the user's place).
export function BodyLink({ href, text }) {
  const isExternal = href.startsWith('http');
  return (
    <a
      href={href}
      className="text-primary underline underline-offset-2"
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {text}
    </a>
  );
}

export function BodyBlock({ block }) {
  if (block.type === 'paragraph') {
    return <p className="text-base text-tier-secondary leading-relaxed">{block.text}</p>;
  }
  if (block.type === 'subheading') {
    return <h2 className="text-[17px] font-semibold text-white mt-2">{block.text}</h2>;
  }
  if (block.type === 'link') {
    return <p className="text-base leading-relaxed"><BodyLink href={block.href} text={block.text} /></p>;
  }
  if (block.type === 'bullets') {
    return (
      <ul className="space-y-3">
        {block.items.map((item, i) => (
          <li key={i} className="text-base text-tier-secondary leading-relaxed flex gap-2">
            <span className="text-primary flex-shrink-0" aria-hidden="true">•</span>
            <span>
              {item.label && <span className="font-semibold text-white">{item.label}. </span>}
              {item.text}
              {item.link && <> <BodyLink href={item.link.href} text={item.link.text} />.</>}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}
