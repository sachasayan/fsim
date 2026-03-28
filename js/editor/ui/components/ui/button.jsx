import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { cn } from '../../utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/8 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default: 'bg-white/[0.06] text-[color:var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:bg-white/[0.1]',
                secondary: 'bg-white/[0.03] text-[color:var(--text)] hover:bg-white/[0.08]',
                accent: 'border-[color:var(--accent-glow)] bg-[linear-gradient(180deg,rgba(125,211,252,0.92),rgba(56,189,248,0.9))] text-slate-950 shadow-[0_0_28px_rgba(56,189,248,0.36)] hover:brightness-105',
                danger: 'bg-[rgba(239,68,68,0.16)] text-red-100 hover:bg-[rgba(239,68,68,0.22)]',
                ghost: 'border-transparent bg-transparent text-[color:var(--text-dim)] hover:bg-white/[0.06] hover:text-[color:var(--text)]'
            },
            size: {
                default: 'h-10 px-4 py-2',
                sm: 'h-9 px-3 py-2 text-xs',
                lg: 'h-11 px-5 py-2.5',
                icon: 'size-10'
            }
        },
        defaultVariants: {
            variant: 'default',
            size: 'default'
        }
    }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
        <Comp
            className={cn(buttonVariants({ variant, size, className }))}
            ref={ref}
            {...props}
        />
    );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
