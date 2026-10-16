import{o as e}from"./Container-5BejJXFK.js";import{c as t,i as n,n as r,r as i,t as a}from"./product-catalog-CZj3HjFr.js";var o=`GraphQL Client`,s=`An error occurred while fetching from the API. Review 'graphQLErrors' for details.`,c=`Response returned unexpected Content-Type:`,l=`An unknown error has occurred. The API did not return a data object or any errors in its response.`,u={json:`application/json`,multipart:`multipart/mixed`},d=`X-SDK-Variant`,f=`X-SDK-Version`,p=`shopify-graphql-client`,m=`2.0.0`,h=1e3,g=[429,503],_=/@(defer)\b/i,v=/boundary="?([^=";]+)"?/i,ee=`\r
\r
`;function y(e,t=o){return e.startsWith(`${t}`)?e:`${t}: ${e}`}function b(e){return e instanceof Error?e.message:JSON.stringify(e)}function x(e){return e instanceof Error&&e.cause?e.cause:void 0}function S(e){return e.flatMap(({errors:e})=>e??[])}function C({client:e,retries:t}){if(t!==void 0&&(typeof t!=`number`||t<0||t>3))throw Error(`${e}: The provided "retries" value (${t}) is invalid - it cannot be less than 0 or greater than 3`)}function w(e,t){return t&&(typeof t!=`object`||Array.isArray(t)||typeof t==`object`&&Object.keys(t).length>0)?{[e]:t}:{}}function T(e,t){if(e.length===0)return t;let n={[e.pop()]:t};return e.length===0?n:T(e,n)}function E(e,t){return Object.keys(t||{}).reduce((n,r)=>(typeof t[r]==`object`||Array.isArray(t[r]))&&e[r]?(n[r]=E(e[r],t[r]),n):(n[r]=t[r],n),Array.isArray(e)?[...e]:{...e})}function D([e,...t]){return t.reduce(E,{...e})}function te({clientLogger:e,customFetchApi:t=fetch,client:n=o,defaultRetryWaitTime:r=h,retriableCodes:i=g}){let a=async(o,s,c)=>{let l=s+1,u=c+1,d;try{if(d=await t(...o),e({type:`HTTP-Response`,content:{requestParams:o,response:d}}),!d.ok&&i.includes(d.status)&&l<=u)throw Error();let n=d?.headers.get(`X-Shopify-API-Deprecated-Reason`)||``;return n&&e({type:`HTTP-Response-GraphQL-Deprecation-Notice`,content:{requestParams:o,deprecationNotice:n}}),d}catch(t){if(l<=u){let t=d?.headers.get(`Retry-After`);return await ne(t?parseInt(t,10):r),e({type:`HTTP-Retry`,content:{requestParams:o,lastResponse:d,retryAttempt:s,maxRetries:c}}),a(o,l,c)}throw Error(y(`${c>0?`Attempted maximum number of ${c} network retries. Last message - `:``}${b(t)}`,n))}};return a}async function ne(e){return new Promise(t=>setTimeout(t,e))}function re({headers:e,url:t,customFetchApi:n=fetch,retries:r=0,logger:i}){C({client:o,retries:r});let a={headers:e,url:t,retries:r},s=ae(te({customFetchApi:n,clientLogger:ie(i),defaultRetryWaitTime:h}),a);return{config:a,fetch:s,request:oe(s),requestStream:pe(s)}}function ie(e){return t=>{e&&e(t)}}async function O(e){let{errors:t,data:n,extensions:r}=await e.json();return{...w(`data`,n),...w(`extensions`,r),headers:e.headers,...t||!n?{errors:{networkStatusCode:e.status,message:y(t?s:l),...w(`graphQLErrors`,t),response:e}}:{}}}function ae(e,{url:t,headers:n,retries:r}){return async(i,a={})=>{let{variables:s,headers:c,url:l,retries:u,keepalive:h,signal:g}=a,_=JSON.stringify({query:i,variables:s});C({client:o,retries:u});let v=Object.entries({...n,...c}).reduce((e,[t,n])=>(e[t]=Array.isArray(n)?n.join(`, `):n.toString(),e),{});return!v[`X-SDK-Variant`]&&!v[`X-SDK-Version`]&&(v[d]=p,v[f]=m),e([l??t,{method:`POST`,headers:v,body:_,signal:g,keepalive:h}],1,u??r)}}function oe(e){return async(...t)=>{if(_.test(t[0]))throw Error(y(`This operation will result in a streamable response - use requestStream() instead.`));let n=null;try{n=await e(...t);let{status:r,statusText:i}=n,a=n.headers.get(`content-type`)||``;return n.ok?a.includes(u.json)?await O(n):{errors:{networkStatusCode:r,message:y(`${c} ${a}`),response:n}}:{errors:{networkStatusCode:r,message:y(i),response:n}}}catch(e){return{errors:{message:b(e),...n==null?{}:{networkStatusCode:n.status,response:n}}}}}}async function*se(e){let t=new TextDecoder;if(e.body[Symbol.asyncIterator])for await(let n of e.body)yield t.decode(n);else{let n=e.body.getReader(),r;try{for(;!(r=await n.read()).done;)yield t.decode(r.value)}finally{n.cancel()}}}function ce(e,t){return{async*[Symbol.asyncIterator](){try{let n=``;for await(let r of e)if(n+=r,n.indexOf(t)>-1){let e=n.lastIndexOf(t),r=n.slice(0,e).split(t).filter(e=>e.trim().length>0).map(e=>e.slice(e.indexOf(ee)+ee.length).trim());r.length>0&&(yield r),n=n.slice(e+t.length),n.trim()===`--`&&(n=``)}}catch(e){throw Error(`Error occured while processing stream payload - ${b(e)}`)}}}}function le(e){return{async*[Symbol.asyncIterator](){try{yield{...await O(e),hasNext:!1}}catch(t){yield{errors:{message:y(b(t)),networkStatusCode:e.status,response:e},hasNext:!1}}}}}function ue(e){return e.map(e=>{try{return JSON.parse(e)}catch(e){throw Error(`Error in parsing multipart response - ${b(e)}`)}}).map(e=>{let{data:t,incremental:n,hasNext:r,extensions:i,errors:a}=e;if(!n)return{data:t||{},...w(`errors`,a),...w(`extensions`,i),hasNext:r};let o=n.map(({data:e,path:t,errors:n})=>({data:e&&t?T(t,e):{},...w(`errors`,n)}));return{data:o.length===1?o[0].data:D(o.map(({data:e})=>e)),...w(`errors`,S(o)),hasNext:r}})}function de(e,t){if(e.length>0)throw Error(s,{cause:{graphQLErrors:e}});if(Object.keys(t).length===0)throw Error(l)}function fe(e,t){let n=(t??``).match(v),r=`--${n?n[1]:`-`}`;if(!e.body?.getReader&&!e.body?.[Symbol.asyncIterator])throw Error(`API multipart response did not return an iterable body`,{cause:e});let i=se(e),a={},o;return{async*[Symbol.asyncIterator](){try{let e=!0;for await(let t of ce(i,r)){let n=ue(t);o=n.find(e=>e.extensions)?.extensions??o;let r=S(n);a=D([a,...n.map(({data:e})=>e)]),e=n.slice(-1)[0].hasNext,de(r,a),yield{...w(`data`,a),...w(`extensions`,o),hasNext:e}}if(e)throw Error(`Response stream terminated unexpectedly`)}catch(t){let n=x(t);yield{...w(`data`,a),...w(`extensions`,o),errors:{message:y(b(t)),networkStatusCode:e.status,...w(`graphQLErrors`,n?.graphQLErrors),response:e},hasNext:!1}}}}}function pe(e){return async(...t)=>{if(!_.test(t[0]))throw Error(y(`This operation does not result in a streamable response - use request() instead.`));try{let n=await e(...t),{statusText:r}=n;if(!n.ok)throw Error(r,{cause:n});let i=n.headers.get(`content-type`)||``;switch(!0){case i.includes(u.json):return le(n);case i.includes(u.multipart):return fe(n,i);default:throw Error(`${c} ${i}`,{cause:n})}}catch(e){return{async*[Symbol.asyncIterator](){let t=x(e);yield{errors:{message:y(b(e)),...w(`networkStatusCode`,t?.status),...w(`response`,t)},hasNext:!1}}}}}}function me({client:e,storeDomain:t}){try{if(!t||typeof t!=`string`)throw Error();let e=t.trim(),n=e.match(/^https?:/)?e:`https://${e}`,r=new URL(n);return r.protocol=`https`,r.origin}catch(n){throw Error(`${e}: a valid store domain ("${t}") must be provided`,{cause:n})}}function k({client:e,currentSupportedApiVersions:t,apiVersion:n,logger:r}){let i=`${e}: the provided apiVersion ("${n}")`,a=`Currently supported API versions: ${t.join(`, `)}`;if(!n||typeof n!=`string`)throw Error(`${i} is invalid. ${a}`);let o=n.trim();t.includes(o)||(r?r({type:`Unsupported_Api_Version`,content:{apiVersion:n,supportedApiVersions:t}}):console.warn(`${i} is likely deprecated or not supported. ${a}`))}function A(e){let t=e*3-2;return t===10?t:`0${t}`}function j(e,t,n){let r=t-n;return r<=0?`${e-1}-${A(r+4)}`:`${e}-${A(r)}`}function he(){let e=new Date,t=e.getUTCMonth(),n=e.getUTCFullYear(),r=Math.floor(t/3+1);return{year:n,quarter:r,version:`${n}-${A(r)}`}}function ge(){let{year:e,quarter:t,version:n}=he(),r=t===4?`${e+1}-01`:`${e}-${A(t+1)}`;return[j(e,t,3),j(e,t,2),j(e,t,1),n,r,`unstable`]}function _e(e){return t=>({...t,...e.headers})}function ve({getHeaders:e,getApiUrl:t}){return(n,r)=>{let i=[n];if(r&&Object.keys(r).length>0){let{variables:n,apiVersion:a,headers:o,retries:s,signal:c}=r;i.push({...n?{variables:n}:{},...o?{headers:e(o)}:{},...a?{url:t(a)}:{},...s?{retries:s}:{},...c?{signal:c}:{}})}return i}}var M=`application/json`,ye=`storefront-api-client`,be=`2.0.0`,xe=`X-Shopify-Storefront-Access-Token`,Se=`Shopify-Storefront-Private-Token`,Ce=`X-SDK-Variant`,we=`X-SDK-Version`,Te=`X-SDK-Variant-Source`,N=`Storefront API Client`;function Ee(e){if(e&&typeof window<`u`)throw Error(`${N}: private access tokens and headers should only be used in a server-to-server implementation. Use the public API access token in nonserver environments.`)}function De(e,t){if(!e&&!t)throw Error(`${N}: a public or private access token must be provided`);if(e&&t)throw Error(`${N}: only provide either a public or private access token`)}function Oe({storeDomain:e,apiVersion:t,publicAccessToken:n,privateAccessToken:r,clientName:i,retries:a=0,customFetchApi:o,logger:s}){let c=ge(),l=me({client:N,storeDomain:e}),u={client:N,currentSupportedApiVersions:c,logger:s};k({...u,apiVersion:t}),De(n,r),Ee(r);let d=ke(l,t,u),f={storeDomain:l,apiVersion:t,...n?{publicAccessToken:n}:{privateAccessToken:r},headers:{"Content-Type":M,Accept:M,[Ce]:ye,[we]:be,...i?{[Te]:i}:{},...n?{[xe]:n}:{[Se]:r}},apiUrl:d(),clientName:i},p=re({headers:f.headers,url:f.apiUrl,retries:a,customFetchApi:o,logger:s}),m=_e(f),h=Ae(f,d),g=ve({getHeaders:m,getApiUrl:h});return Object.freeze({config:f,getHeaders:m,getApiUrl:h,fetch:(...e)=>p.fetch(...g(...e)),request:(...e)=>p.request(...g(...e)),requestStream:(...e)=>p.requestStream(...g(...e))})}function ke(e,t,n){return r=>(r&&k({...n,apiVersion:r}),`${e}/api/${(r??t).trim()}/graphql.json`)}function Ae(e,t){return n=>n?t(n):e.apiUrl}var je=e({addCartLines:()=>qe,createCart:()=>Y,fetchCart:()=>X,fetchProductByHandle:()=>J,fetchProducts:()=>K,filterProductsByCategory:()=>$e,formatPrice:()=>B,getPlaceholderProductImage:()=>et,isShopifyConfigured:()=>F,moveFrontImageFirst:()=>V,placeholderProducts:()=>$,prefetchProductByHandle:()=>Ge,removeCartLines:()=>Ye,shopifyClient:()=>I,sortProductsBySubcategory:()=>Q,subscribeToNewsletter:()=>G,updateCartLines:()=>Je}),Me=`chrgrk-ff.myshopify.com`,P=`74da1c5612402e39f8641e752b6256c2`,Ne=`2025-01`,F=!!P,I=F?Oe({storeDomain:Me,apiVersion:Ne,publicAccessToken:P}):null,L=F?Oe({storeDomain:Me,apiVersion:`unstable`,publicAccessToken:P}):null,R=`
  id
  handle
  title
  description
  featuredImage {
    url
    altText
  }
  images(first: 20) {
    nodes {
      url
      altText
    }
  }
  priceRange {
    minVariantPrice {
      amount
      currencyCode
    }
  }
  variants(first: 1) {
    nodes {
      id
    }
  }
`,Pe=`#graphql
  query Products($first: Int!) {
    products(first: $first) {
      edges {
        node {
          ${R}
        }
      }
    }
  }
`,Fe=`#graphql
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      ${R}
    }
  }
`,z=`
  id
  checkoutUrl
  totalQuantity
  cost {
    subtotalAmount {
      amount
      currencyCode
    }
    totalAmount {
      amount
      currencyCode
    }
  }
  lines(first: 100) {
    nodes {
      id
      quantity
      merchandise {
        ... on ProductVariant {
          id
          title
          price {
            amount
            currencyCode
          }
          image {
            url
            altText
          }
          product {
            title
            handle
          }
        }
      }
    }
  }
`,Ie=`#graphql
  mutation CartCreate($lines: [CartLineInput!]) {
    cartCreate(input: { lines: $lines }) {
      cart {
        ${z}
      }
      userErrors {
        field
        message
      }
    }
  }
`,Le=`#graphql
  query Cart($id: ID!) {
    cart(id: $id) {
      ${z}
    }
  }
`,Re=`#graphql
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ${z}
      }
      userErrors {
        field
        message
      }
    }
  }
`,ze=`#graphql
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ${z}
      }
      userErrors {
        field
        message
      }
    }
  }
`,Be=`#graphql
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        ${z}
      }
      userErrors {
        field
        message
      }
    }
  }
`;function B(e,t){return new Intl.NumberFormat(`en-US`,{style:`currency`,currency:t}).format(Number(e))}function Ve(e,t){let n=[],r=new Set;for(let i of[...e??[],...t??[]])if(i.url&&!r.has(i.url)&&(r.add(i.url),n.push(i),n.length>=5))break;return n.length>0?n:void 0}function V(e,t=0){let n=e[t];return t<=0||!n?e:[n,...e.filter((e,n)=>n!==t)]}function He(e){let t=i(e.handle);if(!t)return e;let n=r(t),a=e.images?.length?V(e.images,t.frontImageIndex):Ve(e.images,n.images);return{...n,...e,id:e.id,price:e.price,imageUrl:a?.[0]?.url??e.imageUrl??n.imageUrl,imageAlt:a?.[0]?.alt??e.imageAlt??n.imageAlt,images:a,variantId:e.variantId,description:e.description||n.description,material:n.material,category:n.category,subcategory:n.subcategory,features:n.features,keyFeatures:n.keyFeatures,dimensionsDisplay:n.dimensionsDisplay}}function H(e){let{amount:t,currencyCode:n}=e.priceRange.minVariantPrice,r=e.images?.nodes.map(t=>({url:t.url,alt:t.altText??e.title}))??[],i=e.featuredImage?[{url:e.featuredImage.url,alt:e.featuredImage.altText??e.title}]:[],a=r.length>0?r:i;return He({id:e.id,handle:e.handle,title:e.title,description:e.description,price:B(t,n),imageUrl:a[0]?.url??e.featuredImage?.url,imageAlt:a[0]?.alt??e.featuredImage?.altText??e.title,images:a.length>0?a:void 0,variantId:e.variants?.nodes?.[0]?.id})}function U(e){return{id:e.id,checkoutUrl:e.checkoutUrl,totalQuantity:e.totalQuantity,subtotal:B(e.cost.subtotalAmount.amount,e.cost.subtotalAmount.currencyCode),total:B(e.cost.totalAmount.amount,e.cost.totalAmount.currencyCode),lines:e.lines.nodes.map(e=>({id:e.id,quantity:e.quantity,title:e.merchandise.product.title,handle:e.merchandise.product.handle,variantId:e.merchandise.id,price:B(e.merchandise.price.amount,e.merchandise.price.currencyCode),imageUrl:e.merchandise.image?.url,imageAlt:e.merchandise.image?.altText??e.merchandise.product.title}))}}function W(e,t){return e?.length?e.map(e=>e.message).join(`; `):t}var Ue=`#graphql
  mutation customerEmailMarketingSubscribe($email: String!) {
    customerEmailMarketingSubscribe(email: $email) {
      customer {
        id
      }
      customerUserErrors {
        field
        message
        code
      }
    }
  }
`;async function G(e){let t=e.trim();if(!t)throw Error(`Enter an email address to subscribe.`);if(!L)throw Error(`Newsletter signup is unavailable right now.`);let{data:n,errors:r}=await L.request(Ue,{variables:{email:t}}),i=n?.customerEmailMarketingSubscribe;if(r||!i)throw Error(`Unable to subscribe right now. Please try again.`);if(i.customerUserErrors?.length)throw Error(W(i.customerUserErrors,`Unable to subscribe right now. Please try again.`))}async function K(e=12){if(!I)return[];let{data:t,errors:n}=await I.request(Pe,{variables:{first:e}});return n?(console.error(`Shopify products query failed`,n),[]):We(t?.products?.edges?.map(e=>H(e.node))??[])}function We(e){let t=new Set(e.map(e=>e.handle)),n=$.filter(e=>!t.has(e.handle));return[...e,...n]}var q=new Map;function Ge(e){J(e)}async function J(e){let t=q.get(e);if(t)return t;let n=Ke(e).then(t=>(t||q.delete(e),t));return q.set(e,n),n}async function Ke(e){if(!I)return null;let{data:t,errors:n}=await I.request(Fe,{variables:{handle:e}});return n||!t?.product?(console.error(`Shopify product query failed`,n),null):H(t.product)}async function Y(e=[]){if(!I)throw Error(`Shopify is not configured`);let{data:t,errors:n}=await I.request(Ie,{variables:{lines:e}}),r=t?.cartCreate;if(n||!r?.cart)throw Error(W(r?.userErrors,`Unable to create cart`));if(r.userErrors?.length)throw Error(W(r.userErrors,`Unable to create cart`));return U(r.cart)}async function X(e){if(!I)return null;let{data:t,errors:n}=await I.request(Le,{variables:{id:e}});return n?(console.error(`Shopify cart query failed`,n),null):t?.cart?U(t.cart):null}async function qe(e,t){if(!I)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await I.request(Re,{variables:{cartId:e,lines:t}}),i=n?.cartLinesAdd;if(r||!i?.cart)throw Error(W(i?.userErrors,`Unable to add to cart`));if(i.userErrors?.length)throw Error(W(i.userErrors,`Unable to add to cart`));return U(i.cart)}async function Je(e,t){if(!I)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await I.request(ze,{variables:{cartId:e,lines:t}}),i=n?.cartLinesUpdate;if(r||!i?.cart)throw Error(W(i?.userErrors,`Unable to update cart`));if(i.userErrors?.length)throw Error(W(i.userErrors,`Unable to update cart`));return U(i.cart)}async function Ye(e,t){if(!I)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await I.request(Be,{variables:{cartId:e,lineIds:t}}),i=n?.cartLinesRemove;if(r||!i?.cart)throw Error(W(i?.userErrors,`Unable to remove from cart`));if(i.userErrors?.length)throw Error(W(i.userErrors,`Unable to remove from cart`));return U(i.cart)}var Xe=new Set([`center-shafted`,`mallet`,`oz-mezz`]),Ze=[`center-shafted`,`mallet`,`oz-mezz`];function Qe(e){let t=n().findIndex(t=>t.handle===e);return t===-1?2**53-1:t}function Z(e){let t=e.subcategory?Ze.indexOf(e.subcategory):-1;return t===-1?Ze.length:t}function Q(e){return[...e].sort((e,t)=>Z(e)-Z(t))}function $e(e,t){return t===`all`?Q(e):Xe.has(t)?e.filter(e=>e.subcategory===t):e.filter(e=>e.category===t).sort((e,t)=>{let n=Z(e)-Z(t);return n===0?Qe(e.handle)-Qe(t.handle):n})}var $=a();function et(e){return $.find(t=>t.handle===e)?.imageUrl??t.galleryFallback}export{K as a,F as c,je as d,G as f,J as i,$ as l,Y as n,$e as o,Je as p,X as r,et as s,qe as t,Ye as u};