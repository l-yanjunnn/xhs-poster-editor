export function InspectorCard({
  title,
  description,
  icon,
  children,
}: {
  title: string
  description: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="inspector-card">
      <div className="inspector-card-heading">
        <span className="inspector-card-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="inspector-card-body">{children}</div>
    </section>
  )
}

