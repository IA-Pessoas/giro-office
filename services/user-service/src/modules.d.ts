declare module "bcryptjs" {
  export function compare(data: string, encrypted: string): Promise<boolean>;
  export function hash(data: string, saltOrRounds: string | number): Promise<string>;

  const bcrypt: {
    compare: typeof compare;
    hash: typeof hash;
  };

  export default bcrypt;
}

declare module "@supabase/supabase-js" {
  export function createClient(url: string, key: string): unknown;
}
