import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import {ThemeProvider,useTheme} from './src/app/theme/ThemeProvider.jsx';
import {TraceabilityWorkspace} from './src/features/traceability/components/TraceabilityWorkspace.jsx';
import './src/styles/tokens.css';
import './src/styles/base.css';
import './src/styles/global.css';
import graph from './s109-workspace-qa.json';
function App(){const theme=useTheme();const [open,setOpen]=React.useState(true);return <><button onClick={theme.cycleTheme}>Tema: {theme.themePreference}</button><p>Fixture artificial do teste de persistência · nenhuma escrita · QA local</p><button onClick={()=>setOpen(true)}>Abrir workspace</button>{open&&<TraceabilityWorkspace requirement={{id:graph.perspective.id,displayId:`REQ-${graph.perspective.id}`,title:'Fixture artificial · cadeia completa'}} graph={{data:graph}} onClose={()=>setOpen(false)}/>}</>}
createRoot(document.getElementById('root')).render(<MemoryRouter><ThemeProvider><App/></ThemeProvider></MemoryRouter>);
