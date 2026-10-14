import React from 'react';
import { PressButton } from './motion-system.jsx';

export function SidebarTipButton({ tip, tipEnabled=true, ...props }) {
  return <PressButton {...props} tip={tipEnabled?tip:undefined} tipPlacement="right" tipRail/>;
}
