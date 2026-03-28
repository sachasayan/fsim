import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';

import { cn } from '../../utils';

function ChevronDownIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 opacity-70">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
        ref={ref}
        className={cn(
            'flex h-10 w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-[color:var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none focus:ring-2 focus:ring-[color:var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-[color:var(--text-dim)]',
            className
        )}
        {...props}
    >
        {children}
        <SelectPrimitive.Icon asChild>
            <ChevronDownIcon />
        </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectContent = React.forwardRef(({ className, children, position = 'popper', ...props }, ref) => (
    <SelectPrimitive.Portal>
        <SelectPrimitive.Content
            ref={ref}
            className={cn(
                'relative z-50 min-w-[8rem] overflow-hidden rounded-xl border border-white/10 bg-slate-950/98 text-[color:var(--text)] shadow-2xl',
                position === 'popper' && 'translate-y-1',
                className
            )}
            position={position}
            {...props}
        >
            <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectItem = React.forwardRef(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
        ref={ref}
        className={cn(
            'relative flex w-full cursor-default select-none items-center rounded-lg px-3 py-2 text-sm outline-none focus:bg-white/10 data-[state=checked]:bg-white/[0.08] data-[state=checked]:text-[color:var(--accent-strong)]',
            className
        )}
        {...props}
    >
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
