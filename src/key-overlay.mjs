const allowed = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Enter|Backspace|Space|Tab|Esc|Shift|Ctrl|Alt|CapsLock|[←↑→↓]|Home|End|PageUp|PageDown|Insert|Delete|Num [0-9]|[;,./=\-`\[\]\\'])$/;
const compactLabels = {
  Backspace: 'Bksp', CapsLock: 'Caps', PageDown: 'PgDn', PageUp: 'PgUp',
  Insert: 'Ins', Delete: 'Del', Enter: '回车',
};
const badgeLifetime = 1500;
const maximumBadges = 6;

export function compactKeyLabel(label) {
  if (Object.hasOwn(compactLabels, label)) return compactLabels[label];
  return /^Num [0-9]$/.test(label) ? label.replace(' ', '') : label;
}

function canonicalKeyLabel(label) {
  if (label === ' ' || label === 'SPACE' || label === 'Spacebar') return 'Space';
  return typeof label === 'string' && allowed.test(label) ? label : '';
}

// Bounded ephemeral badges only; never serialized into preferences or logs.
export class KeyOverlay {
  badges = [];
  sequence = 0;

  add(labels, now, prefs, repeat = false) {
    this.badges = this.badges.filter(badge => badge.expires > now);
    if (!prefs.showKeys || (repeat && !prefs.repeatKeys)) return;
    const count = prefs.multiKeys ? prefs.maxKeys : 1;
    for (const source of labels.slice(-maximumBadges)) {
      const label = canonicalKeyLabel(source);
      if (!label) continue;
      const badge = {label, id: ++this.sequence, expires: now + badgeLifetime};
      this.badges = [...this.badges, badge].slice(-count);
    }
  }

  read(now, prefs) {
    this.badges = this.badges.filter(badge => badge.expires > now);
    return prefs.showKeys ? this.badges.slice(-(prefs.multiKeys ? prefs.maxKeys : 1)) : [];
  }

  clear() {
    this.badges = [];
  }
}

// A new press should animate only its own badge. Retain existing elements
// until their individual expiry or removal from the visible sequence.
export function renderKeyBadges(container, badges) {
  const doc = container.ownerDocument;
  let cursor = container.firstElementChild;
  for (const {id, label} of badges) {
    while (cursor && Number(cursor.dataset.badgeId) < id) {
      const stale = cursor;
      cursor = cursor.nextElementSibling;
      stale.remove();
    }
    if (cursor && Number(cursor.dataset.badgeId) === id) {
      cursor = cursor.nextElementSibling;
      continue;
    }
    const key = doc.createElement('kbd');
    key.dataset.badgeId = String(id);
    const full = doc.createElement('span');
    full.className = 'key-label';
    full.textContent = label;
    const compact = doc.createElement('span');
    compact.className = 'key-label-compact';
    compact.textContent = compactKeyLabel(label);
    key.append(full, compact);
    container.insertBefore(key, cursor);
  }
  while (cursor) {
    const stale = cursor;
    cursor = cursor.nextElementSibling;
    stale.remove();
  }
}
