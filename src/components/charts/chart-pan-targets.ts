// Capture only screen-extending primitives, once per React commit rather than
// querying the entire SVG on every pointer frame. Geometry remains React-owned;
// these writes adjust screen edges for the temporary parent translation only.
export function collectPanTargets(root: SVGGElement | null) {
  return {
    rays: Array.from(
      root?.querySelectorAll<SVGLineElement>('[data-pan-ray-edge]') ?? [],
    ).map((node) => ({
      node,
      edge: Number(node.dataset.panRayEdge),
      anchor: Number(node.getAttribute('x1')),
    })),
    groups: Array.from(
      root?.querySelectorAll<SVGGElement>('[data-pan-ray-group]') ?? [],
    ).map((node) => ({
      node,
      edge: Number(node.dataset.panRayGroup),
      anchor: Number(node.dataset.panRayAnchor),
    })),
    zones: Array.from(
      root?.querySelectorAll<SVGRectElement>('[data-pan-zone-edge]') ?? [],
    ).map((node) => ({
      node,
      edge: Number(node.dataset.panZoneEdge),
      anchor: Number(node.getAttribute('x')),
    })),
    sessions: Array.from(
      root?.querySelectorAll<SVGLineElement>('[data-pan-session-top]') ?? [],
    ).map((node) => ({
      node,
      top: Number(node.dataset.panSessionTop),
      bottom: Number(node.dataset.panSessionBottom),
    })),
    labels: Array.from(
      root?.querySelectorAll<SVGTextElement>('[data-pan-label-x]') ?? [],
    ).map((node) => ({
      node,
      x: Number(node.dataset.panLabelX),
      right: Number(node.dataset.panLabelRight),
      fixedRight: node.hasAttribute('data-pan-label-fixed-right'),
    })),
    sessionLabels: Array.from(
      root?.querySelectorAll<SVGTextElement>('[data-pan-session-label]') ?? [],
    ).map((node) => ({ node, y: Number(node.dataset.panSessionLabel) })),
  };
}
function attribute(node: Element, name: string, value: string | number) {
  const next = String(value);
  if (node.getAttribute(name) !== next) node.setAttribute(name, next);
}
export function paintPanTargets(
  targets: ReturnType<typeof collectPanTargets>,
  x: number,
  y: number,
) {
  for (const t of targets.rays) {
    attribute(t.node, 'x2', t.edge - x);
    attribute(
      t.node,
      'visibility',
      t.anchor > t.edge - x ? 'hidden' : 'visible',
    );
  }
  for (const t of targets.groups)
    attribute(
      t.node,
      'visibility',
      t.anchor > t.edge - x ? 'hidden' : 'visible',
    );
  for (const t of targets.zones)
    attribute(t.node, 'width', Math.max(0, t.edge - x - t.anchor));
  for (const t of targets.sessions) {
    attribute(t.node, 'y1', t.top - y);
    attribute(t.node, 'y2', t.bottom - y);
  }
  for (const t of targets.labels)
    attribute(
      t.node,
      'x',
      t.fixedRight ? t.right - x : Math.min(t.right - x, Math.max(6 - x, t.x)),
    );
  for (const t of targets.sessionLabels) attribute(t.node, 'y', t.y - y);
}
