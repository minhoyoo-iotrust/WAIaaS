export interface BreadcrumbProps {
  pageName: string;
  tabName?: string;
  onPageClick?: () => void;
}

export function Breadcrumb({ pageName, tabName, onPageClick }: BreadcrumbProps) {
  if (!tabName) return null;

  return (
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <button class="breadcrumb-page" onClick={onPageClick} type="button">
        {pageName}
      </button>
      <span class="breadcrumb-separator" aria-hidden="true">&gt;</span>
      <span class="breadcrumb-current" aria-current="page">{tabName}</span>
    </nav>
  );
}
