import Image from "next/image";

const Loader = () => {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <div className="h-[60px] w-[60px] overflow-hidden rounded-full md:h-[100px] md:w-[100px]">
        <Image
          src="/logos/lions/Castelo.webp"
          alt="Loading"
          width={100}
          height={100}
          priority
          className="h-full w-full object-cover [animation:blink_1.5s_ease-in-out_infinite]"
        />
      </div>
    </div>
  );
};

export default Loader;
