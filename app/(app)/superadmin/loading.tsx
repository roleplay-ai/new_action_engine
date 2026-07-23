export default function Loading() {
  return <div className="superadmin-page superadmin-loading-page" aria-label="Loading superadmin data">
    <div className="superadmin-skeleton superadmin-skeleton-title" />
    <div className="superadmin-stat-grid">
      {[0, 1, 2].map((item) => <div className="superadmin-skeleton superadmin-skeleton-stat" key={item} />)}
    </div>
    <div className="superadmin-skeleton superadmin-skeleton-panel" />
  </div>;
}
