// Next remounts a template on every page change (not on ?query changes like
// opening a task), so the new page plays its ease-in each time.
export default function HubTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
