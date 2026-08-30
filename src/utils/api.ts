/**
 * Google Apps Script Bridge
 * Used for interacting with GAS server-side functions.
 */
export const runGAS = (functionName: string, ...args: any[]): Promise<any> => {
    return new Promise((resolve, reject) => {
        if (typeof (window as any).google === 'undefined' || !(window as any).google.script) {
            console.warn(`[GAS Mock] Calling ${functionName} with`, args);
            resolve(null);
            return;
        }

        (window as any).google.script.run
            .withSuccessHandler((response: any) => {
                try {
                    if (typeof response === 'string') {
                        resolve(JSON.parse(response));
                    } else {
                        resolve(response);
                    }
                } catch (e) {
                    resolve(response);
                }
            })
            .withFailureHandler((error: any) => {
                console.error(`GAS Error [${functionName}]:`, error);
                reject(error);
            })
        [functionName](...args);
    });
};
