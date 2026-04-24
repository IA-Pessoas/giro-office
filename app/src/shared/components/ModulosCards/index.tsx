import React, { useState } from 'react';
import Link from 'next/link';

interface ModuleCardProps {
  name: string;
  imageUrl: string;
  link: string;
  color: string;
}

export function ModuleCard({ name, imageUrl, link, color }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Link href={link} className="no-underline">
      <article
        className="cursor-pointer rounded-md p-4 shadow-md transition duration-500 hover:shadow-lg"
        style={{
          color: isHovered ? 'white' : undefined,
          background: isHovered ? color : undefined,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <img
          src={imageUrl}
          alt={name}
          className="mx-auto max-w-[150px]"
          style={isHovered ? { filter: 'brightness(0.5)' } : {}}
        />
        <p className="mt-4 text-center font-bold">
          {name}
        </p>
      </article>
    </Link>
  );
};