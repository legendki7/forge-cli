import brandMarkUrl from './assets/brand/forgeki-mark.png';

export type BrandMarkSize = 'sidebar' | 'hero' | 'about';

export function BrandMark({
  size,
  decorative = false,
}: {
  size: BrandMarkSize;
  decorative?: boolean;
}) {
  return (
    <span className="brand-mark-frame" data-size={size}>
      <img
        className="brand-mark"
        src={brandMarkUrl}
        alt={decorative ? '' : 'ForgeKi logo'}
        draggable="false"
      />
    </span>
  );
}
