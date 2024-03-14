import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { ApiDataInterface } from "../interfaces/ApiDataInterface";
import { ApiResponseInterface } from "../interfaces/ApiResponseInterface";

export class ApiDataFactory {
    public static classMap = new Map<string, { new (): ApiDataInterface }>();

    public static registerObjectClass(key: string, classConstructor: { new (): ApiDataInterface }) {
        if (!this.classMap.has(key)) this.classMap.set(key, classConstructor);
    }

    private static async _request<T extends ApiDataInterface>(
        method: string,
        classKey: string,
        params?: any,
        body?: any
    ): Promise<ApiResponseInterface> {
        const factoryClass = this.classMap.get(classKey);

        if (!factoryClass) {
            throw new Error(`Class not registered for key: ${classKey}`);
        }

        const response: ApiResponseInterface = {
            ok: true,
            response: 0,
            data: [],
            error: "",
        };

        let link = params?.link;
        if (!link) link = new factoryClass().generateApiUrl(params);

        let token: string | undefined = undefined;
        if (typeof window === "undefined") {
            const serverCookies = await import("next/headers");
            const cookieStore = serverCookies.cookies();

            token =
                cookieStore.get("next-auth.session-token")?.value ??
                cookieStore.get("__Secure-next-auth.session-token")?.value ??
                undefined;
            if (!link.startsWith("http")) link = process.env.NEXT_PUBLIC_API_URL + link;
        } else {
            if (link.startsWith("http")) link = link.substring(process.env.NEXT_PUBLIC_API_URL?.length ?? 0);
            link = process.env.NEXT_PUBLIC_INTERNAL_API_URL + "?uri=" + encodeURIComponent(link);
        }

        const axiosConfig: AxiosRequestConfig = {
            method: method,
            url: link,
            headers: {
                'Accept-Encoding': 'identity',
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            data: body ? JSON.stringify(body) : undefined,
        };

        if (token) {
            axiosConfig.headers = {
                ...axiosConfig.headers,
                Authorization: `Bearer ${token}`,
            };
        }

        try {
            const axiosResponse: AxiosResponse = await axios(axiosConfig);

            response.ok = axiosResponse.status >= 200 && axiosResponse.status < 300;
            response.response = axiosResponse.status;

            if (!response.ok) {
                response.error = axiosResponse.statusText;
                return response;
            }

            if (axiosResponse.status === 204) return response;

            const jsonData: any = axiosResponse.data;

            const included: any = jsonData.included ?? [];

            if (jsonData.links) {
                response.self = jsonData.links.self;

                if (jsonData.links.next) {
                    response.next = jsonData.links.next;
                    response.nextPage = async () => ApiDataFactory.get(classKey, { link: jsonData.links.next });
                }

                if (jsonData.links.prev) {
                    response.prev = jsonData.links.prev;
                    response.prevPage = async () => ApiDataFactory.get(classKey, { link: jsonData.links.prev });
                }
            }

            if (Array.isArray(jsonData.data)) {
                const responseData: T[] = [];

                for (const data of jsonData.data) {
                    const object = new factoryClass();
                    object.rehydrate({ jsonApi: data, included: included });
                    responseData.push(object as T);
                }

                response.data = responseData;
            } else {
                const responseData = new factoryClass();
                responseData.rehydrate({ jsonApi: jsonData.data, included: included });

                response.data = responseData;
            }
        } catch (error) {
            console.error(error);
        }

        return response;
    }

    public static async get<T extends ApiDataInterface>(classKey: string, params?: any): Promise<ApiResponseInterface> {
        return this._request<T>("GET", classKey, params);
    }

    public static async post<T extends ApiDataInterface>(
        classKey: string,
        params?: any,
        body?: any
    ): Promise<ApiResponseInterface> {
        if (!body) body = {};
        return this._request<T>("POST", classKey, params, body);
    }

    public static async put<T extends ApiDataInterface>(
        classKey: string,
        params?: any,
        body?: any
    ): Promise<ApiResponseInterface> {
        return this._request<T>("PUT", classKey, params, body);
    }

    public static async patch<T extends ApiDataInterface>(
        classKey: string,
        params?: any,
        body?: any
    ): Promise<ApiResponseInterface> {
        return this._request<T>("PATCH", classKey, params, body);
    }

    public static async delete<T extends ApiDataInterface>(
        classKey: string,
        params?: any
    ): Promise<ApiResponseInterface> {
        return this._request<T>("DELETE", classKey, params);
    }
}
