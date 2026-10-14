import React, {useId} from 'react';
export function SettingsRow({title,description,children}) {
  const id=useId();
  return <div className="setting-row"><div className="setting-label"><h3 id={id}>{title}</h3>{description&&<p>{description}</p>}</div><div className="setting-control" aria-labelledby={id}>{children}</div></div>;
}
export function SettingsGroup({title,description,children}) {
  return <section className="settings-group"><header><h2>{title}</h2>{description&&<p>{description}</p>}</header><div>{children}</div></section>;
}
