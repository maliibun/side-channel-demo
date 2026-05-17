//the brand header at the top of the page - mark + title + subtitle
export default function Brand(){
    return (
        <header className="brand">
            <div className="brand__mark" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M13 3 L5 14 L11 14 L11 21 L19 10 L13 10 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                </svg>
            </div>
            <div>
                <h1 className="brand__title">Side-channel demo</h1>
                <p className="brand__sub">Recovering secrets from timing & power</p>
            </div>
        </header>
    );
}
