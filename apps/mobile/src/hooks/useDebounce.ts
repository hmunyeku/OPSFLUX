/**
 * Debounce hook — delays execution until the user stops typing.
 *
 * Usage:
 *   const debouncedQuery = useDebounce(searchInput, 300);
 *   useEffect(() => { search(debouncedQuery); }, [debouncedQuery]);
 */

import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
