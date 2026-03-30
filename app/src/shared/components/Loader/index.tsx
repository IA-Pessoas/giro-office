// Loader.tsx
import { CSSProperties } from 'react';

const Loader = () => {
    const imageStyle: CSSProperties = {
        animation: 'blink 1.5s ease-in-out infinite',
    };

    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="h-[60px] w-[60px] overflow-hidden rounded-full md:h-[100px] md:w-[100px]">
                <img
                    src={`/logos/lions/Castelo.webp`}
                    alt="Loading"
                    style={imageStyle}
                />
            </div>
        </div>

    );
};

export default Loader;
