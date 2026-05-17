import { createContext, useState, useContext } from 'react';

//React Context for the hover-driven explainer sidebar
//<ExplainProvider> wraps the app; <ExplainOn title body> sets the currently-shown explanation on hover/focus
const ExplainContext = createContext(null);

export function ExplainProvider({ children }){
    const [explain, setExplain] = useState(null);
    return (
        <ExplainContext.Provider value={{explain, setExplain}}>
            {children}
        </ExplainContext.Provider>
    );
}

export function useExplain(){
    return useContext(ExplainContext);
}

export default ExplainContext;
