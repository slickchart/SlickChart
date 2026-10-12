export function matchSquareService(services, name) {
  const want = String(name || '').trim().toLowerCase();
  if (!want) return null;
  const nm = x => String((x && x.name) || '').trim().toLowerCase();
  return (services || []).find(x => nm(x) === want)
      || (services || []).find(x => nm(x) && nm(x).indexOf(want) >= 0)
      || (services || []).find(x => nm(x) && want.indexOf(nm(x)) >= 0)
      || null;
}

