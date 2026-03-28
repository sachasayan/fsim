import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '../../utils';

function TooltipProvider({ delayDuration = 120, ...props }) {
    return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

function Tooltip({ ...props }) {
    return <TooltipPrimitive.Root {...props} />;
}

function TooltipTrigger({ ...props }) {
    return <TooltipPrimitive.Trigger asChild {...props} />;
}

const TooltipContent = React.forwardRef(({ className, sideOffset = 8, ...props }, ref) => (
    <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                'z-50 overflow-hidden rounded-lg border border-white/10 bg-slate-950/98 px-3 py-1.5 text-xs font-medium text-[color:var(--text)] shadow-2xl',
                className
            )}
            {...props}
        />
    </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
