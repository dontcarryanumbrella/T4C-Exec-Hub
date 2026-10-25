"use client";

import { useSearchParams, usePathname } from "next/navigation";

// Keeps what you searched for in the box while you look at the results.
export default function SearchBox() {
  const params = useSearchParams();
  const onSearch = usePathname() === "/search";
  return (
    <input
      key={onSearch ? params.get("q") ?? "" : "idle"}
      type="search"
      name="q"
      defaultValue={onSearch ? params.get("q") ?? "" : ""}
      placeholder="Search the hub"
      aria-label="Search"
      maxLength={100}
    />
  );
}
