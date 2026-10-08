declare module 'firebase-admin';
declare module 'firebase-admin/app' {
  export interface App {
    [key: string]: any;
  }
}
