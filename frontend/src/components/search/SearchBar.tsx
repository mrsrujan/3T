import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearch } from "../../hooks/useSearch";
import { SearchResultsDropdown } from "./SearchResultsDropdown";
import type { SearchResultItem } from "../../api/types";

const DEBOUNCE_MS = 250;

export function SearchBar() {
  const [inputValue, setInputValue] = useState("");
  const [debouncedValue, setDebouncedValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(inputValue), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data, isFetching } = useSearch(debouncedValue);

  function handleSelect(item: SearchResultItem) {
    setIsOpen(false);
    setInputValue("");
    navigate(`/stock/${item.market}/${item.symbol}`);
  }

  return (
    <div ref={containerRef} className="relative w-64">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search stocks…"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      />
      {isOpen && debouncedValue.trim().length > 0 && (
        <SearchResultsDropdown
          items={data?.items ?? []}
          isLoading={isFetching}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}
