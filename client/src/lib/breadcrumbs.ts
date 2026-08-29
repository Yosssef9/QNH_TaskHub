export interface BreadcrumbItem {
  label: string
  path?: string
}

function labelFromSegment(segment: string): string {
  return decodeURIComponent(segment)
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function buildBreadcrumbs(
  pathname: string,
  labelMap: Readonly<Record<string, string>> = {},
): BreadcrumbItem[] {
  if (pathname === '/') return [{ label: labelMap['/'] ?? 'Dashboard', path: '/' }]

  const breadcrumbs: BreadcrumbItem[] = [{ label: labelMap['/'] ?? 'Dashboard', path: '/' }]
  let currentPath = ''

  for (const segment of pathname.split('/').filter(Boolean)) {
    currentPath += `/${segment}`
    breadcrumbs.push({
      label: labelMap[currentPath] ?? labelFromSegment(segment),
      path: currentPath,
    })
  }

  return breadcrumbs
}
