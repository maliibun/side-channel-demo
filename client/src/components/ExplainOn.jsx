import { useExplain } from './ExplainContext';

//wraps a chunk of UI - on hover/focus, sets the sidebar content to {title, body}
//no-op if there's no surrounding ExplainProvider
export default function ExplainOn({ title, body, children }){
    const ctx = useExplain();
    if(!ctx) return children;
    const handle = () => ctx.setExplain({title, body});
    return (
        <div className="explain-on" onMouseEnter={handle} onFocus={handle}>
            {children}
        </div>
    );
}
