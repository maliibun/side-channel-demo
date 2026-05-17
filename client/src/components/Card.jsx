//card with optional header (title + right-side meta slot)
export default function Card({ title, right, children, className = '' }){
    return (
        <section className={'card ' + className}>
            {(title || right) && (
                <div className="card__head">
                    {title && <h3>{title}</h3>}
                    {right}
                </div>
            )}
            {children}
        </section>
    );
}
