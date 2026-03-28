import * as React from 'react';

import { cn } from '../../utils';

function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'rounded-[1.35rem] border border-white/8 bg-[linear-gradient(180deg,rgba(17,24,39,0.82),rgba(8,13,24,0.94))] shadow-[0_20px_40px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl',
                className
            )}
            {...props}
        />
    );
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('p-4', className)} {...props} />;
}

export { Card, CardContent };
