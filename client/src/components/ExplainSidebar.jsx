import { useExplain } from './ExplainContext';

//sticky sidebar that shows whichever ExplainOn block the user is hovering
export default function ExplainSidebar(){
    const ctx = useExplain();
    const explain = ctx ? ctx.explain : null;
    return (
        <aside className="explainer">
            <div className="explainer__head">
                <span className="explainer__dot" />
                <span className="explainer__label mono">explanation</span>
            </div>
            <div className="explainer__body">
                {explain ? (
                    <>
                        <h4 className="explainer__title">{explain.title}</h4>
                        <div className="explainer__text">{explain.body}</div>
                    </>
                ) : (
                    <div className="explainer__empty">
                        <p>Hover over any chart, control, or visualization to see what it means.</p>
                    </div>
                )}
            </div>
        </aside>
    );
}
