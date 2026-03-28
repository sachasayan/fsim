import * as React from 'react';
import * as TogglePrimitive from '@radix-ui/react-toggle';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../utils';

const toggleVariants = cva(
    'inline-flex items-center justify-center gap-2 rounded-2xl border border-white/8 px-3 py-3 text-left text-sm font-medium text-[color:var(--text-dim)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all outline-none hover:bg-white/[0.06] hover:text-[color:var(--text)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)] data-[state=on]:border-[color:var(--accent-glow)] data-[state=on]:bg-[linear-gradient(180deg,rgba(30,41,59,0.92),rgba(15,23,42,0.92))] data-[state=on]:text-[color:var(--text)] data-[state=on]:shadow-[0_0_0_1px_rgba(56,189,248,0.25),0_14px_28px_rgba(0,0,0,0.18)] disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            size: {
                default: 'min-h-10 px-3',
                sm: 'min-h-9 px-2.5 text-xs',
                lg: 'min-h-11 px-4'
            }
        },
        defaultVariants: {
            size: 'default'
        }
    }
);

type ToggleProps = React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> &
    VariantProps<typeof toggleVariants>;

const Toggle = React.forwardRef<
    React.ElementRef<typeof TogglePrimitive.Root>,
    ToggleProps
>(({ className, size, ...props }, ref) => (
    <TogglePrimitive.Root ref={ref} className={cn(toggleVariants({ size, className }))} {...props} />
));
Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle, toggleVariants };
