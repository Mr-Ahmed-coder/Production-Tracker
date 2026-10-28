import { ChevronLeft, ChevronRight } from "lucide-react";

export function PaginationBar({
  page,
  totalPages,
  totalItems,
  itemName = "items",
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  itemName?: string;
  onPageChange: (newPage: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination-bar" aria-label="Pagination Navigation">
      <button
        type="button"
        className="secondary-button pagination-btn"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        aria-label="Previous page"
      >
        <ChevronLeft size={15} /> Previous
      </button>
      <span className="pagination-meta" aria-live="polite">
        Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalItems}{" "}
        {itemName})
      </span>
      <button
        type="button"
        className="secondary-button pagination-btn"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        aria-label="Next page"
      >
        Next <ChevronRight size={15} />
      </button>
    </nav>
  );
}
