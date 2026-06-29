import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";

interface ModuleCardProps {
  name: string;
  imageUrl: string;
  link: string;
  color: string;
}

export function ModuleCard({ name, imageUrl, link, color }: ModuleCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const imageStyle: CSSProperties = isHovered ? { filter: "brightness(0.5)" } : {};

  return (
    <Link href={link} className="no-underline">
      <article
        className="cursor-pointer rounded-md p-4 shadow-md transition duration-500 hover:shadow-lg"
        style={{
          color: isHovered ? "white" : undefined,
          background: isHovered ? color : undefined,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Image
          src={imageUrl}
          alt={name}
          width={150}
          height={150}
          className="mx-auto h-auto max-w-[150px]"
          style={imageStyle}
        />
        <p className="mt-4 text-center font-bold">{name}</p>
      </article>
    </Link>
  );
}
