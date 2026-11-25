/**
 * 内置 license 验签公钥（base64(PEM)）。
 *
 * 为什么写死在代码里而不是读环境变量：
 *   放在 .env / 环境变量里，客户可以替换成自己的公钥，再用自己的私钥自签一个
 *   license —— 等于没有门禁。写进编译产物才构成「追加信任 = 绕过」的反面。
 *
 * 轮换方式：重新 `node scripts/license-keygen.js`，把生成的 public key
 * base64 覆盖到下面的常量，重新发布企业版包。**私钥永远不进本仓库。**
 */
export const LICENSE_PUBLIC_KEY_B64 =
  'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUFwWUNMcjRwcWM5UE9lVTgwUHBSNQpJeERRenJHNG9HSW9SeGxseDZjbzYxbjJydUU1bCtjNVg0ME5Xa1hVMFBGbzNFN0tGcUdvcm4yZjlybCtUK3JxCnNTeXkvUW9PR3orRm1EMTVWR1FpZHRHcXgzNEFtVXowWVAxNVJrM0k5UVhMMy9SL2VDQWY4b2QyQmphSzlxVksKS0gxZUtTWm43Yk1oWmZUSXhWcEZlcHZadXVwNHdDbE9NWU1zUXFIT2JpQ2NoZElMejROVFErazdJSU9MTklXRgo1QUMxYzlPSjFMZHVuS1BxU3ZzZXpUbXBzakxJYlR3ZjZydktXVVNlenJZQmlzZCsyZ2JyZndJY3FxUitOTDFGCk45eHp1Y3Vib0RsbjczUzk0MThqNmtTS3hJVnFRL2VaUUNSek9DVCtsV3ZvYUloS2FOdWE4WG5yWGl6TWZVK1QKa3dJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==';
