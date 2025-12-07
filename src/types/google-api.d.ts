// Google API type declarations
declare global {
  interface Window {
    gapi: {
      load: (api: string, callback: () => void) => void;
      client: {
        init: (config: any) => Promise<void>;
        drive: {
          files: {
            list: (params: any) => Promise<any>;
          };
        };
        docs: {
          documents: {
            get: (params: any) => Promise<any>;
          };
        };
      };
      auth2: {
        getAuthInstance: () => {
          signIn: () => Promise<any>;
          signOut: () => Promise<void>;
          currentUser: {
            get: () => any;
          };
        };
      };
    };
  }
}

export {};

