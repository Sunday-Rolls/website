import{i as e}from"./jsx-runtime-B-hcVAMW.js";import{i as t,n,o as r,r as i,s as a,t as o}from"./product-catalog-DRxsynFJ.js";import{n as s}from"./shopifyAnalytics-B2FnRwTi.js";var c=`GraphQL Client`,l=`An error occurred while fetching from the API. Review 'graphQLErrors' for details.`,u=`Response returned unexpected Content-Type:`,d=`An unknown error has occurred. The API did not return a data object or any errors in its response.`,f={json:`application/json`,multipart:`multipart/mixed`},p=`X-SDK-Variant`,m=`X-SDK-Version`,h=`shopify-graphql-client`,g=`2.0.0`,_=1e3,v=[429,503],y=/@(defer)\b/i,ee=/boundary="?([^=";]+)"?/i,b=`\r
\r
`;function x(e,t=c){return e.startsWith(`${t}`)?e:`${t}: ${e}`}function S(e){return e instanceof Error?e.message:JSON.stringify(e)}function C(e){return e instanceof Error&&e.cause?e.cause:void 0}function w(e){return e.flatMap(({errors:e})=>e??[])}function T({client:e,retries:t}){if(t!==void 0&&(typeof t!=`number`||t<0||t>3))throw Error(`${e}: The provided "retries" value (${t}) is invalid - it cannot be less than 0 or greater than 3`)}function E(e,t){return t&&(typeof t!=`object`||Array.isArray(t)||typeof t==`object`&&Object.keys(t).length>0)?{[e]:t}:{}}function D(e,t){if(e.length===0)return t;let n={[e.pop()]:t};return e.length===0?n:D(e,n)}function O(e,t){return Object.keys(t||{}).reduce((n,r)=>(typeof t[r]==`object`||Array.isArray(t[r]))&&e[r]?(n[r]=O(e[r],t[r]),n):(n[r]=t[r],n),Array.isArray(e)?[...e]:{...e})}function k([e,...t]){return t.reduce(O,{...e})}function te({clientLogger:e,customFetchApi:t=fetch,client:n=c,defaultRetryWaitTime:r=_,retriableCodes:i=v}){let a=async(o,s,c)=>{let l=s+1,u=c+1,d;try{if(d=await t(...o),e({type:`HTTP-Response`,content:{requestParams:o,response:d}}),!d.ok&&i.includes(d.status)&&l<=u)throw Error();let n=d?.headers.get(`X-Shopify-API-Deprecated-Reason`)||``;return n&&e({type:`HTTP-Response-GraphQL-Deprecation-Notice`,content:{requestParams:o,deprecationNotice:n}}),d}catch(t){if(l<=u){let t=d?.headers.get(`Retry-After`);return await ne(t?parseInt(t,10):r),e({type:`HTTP-Retry`,content:{requestParams:o,lastResponse:d,retryAttempt:s,maxRetries:c}}),a(o,l,c)}throw Error(x(`${c>0?`Attempted maximum number of ${c} network retries. Last message - `:``}${S(t)}`,n))}};return a}async function ne(e){return new Promise(t=>setTimeout(t,e))}function re({headers:e,url:t,customFetchApi:n=fetch,retries:r=0,logger:i}){T({client:c,retries:r});let a={headers:e,url:t,retries:r},o=ae(te({customFetchApi:n,clientLogger:ie(i),defaultRetryWaitTime:_}),a);return{config:a,fetch:o,request:oe(o),requestStream:pe(o)}}function ie(e){return t=>{e&&e(t)}}async function A(e){let{errors:t,data:n,extensions:r}=await e.json();return{...E(`data`,n),...E(`extensions`,r),headers:e.headers,...t||!n?{errors:{networkStatusCode:e.status,message:x(t?l:d),...E(`graphQLErrors`,t),response:e}}:{}}}function ae(e,{url:t,headers:n,retries:r}){return async(i,a={})=>{let{variables:o,headers:s,url:l,retries:u,keepalive:d,signal:f}=a,_=JSON.stringify({query:i,variables:o});T({client:c,retries:u});let v=Object.entries({...n,...s}).reduce((e,[t,n])=>(e[t]=Array.isArray(n)?n.join(`, `):n.toString(),e),{});return!v[`X-SDK-Variant`]&&!v[`X-SDK-Version`]&&(v[p]=h,v[m]=g),e([l??t,{method:`POST`,headers:v,body:_,signal:f,keepalive:d}],1,u??r)}}function oe(e){return async(...t)=>{if(y.test(t[0]))throw Error(x(`This operation will result in a streamable response - use requestStream() instead.`));let n=null;try{n=await e(...t);let{status:r,statusText:i}=n,a=n.headers.get(`content-type`)||``;return n.ok?a.includes(f.json)?await A(n):{errors:{networkStatusCode:r,message:x(`${u} ${a}`),response:n}}:{errors:{networkStatusCode:r,message:x(i),response:n}}}catch(e){return{errors:{message:S(e),...n==null?{}:{networkStatusCode:n.status,response:n}}}}}}async function*se(e){let t=new TextDecoder;if(e.body[Symbol.asyncIterator])for await(let n of e.body)yield t.decode(n);else{let n=e.body.getReader(),r;try{for(;!(r=await n.read()).done;)yield t.decode(r.value)}finally{n.cancel()}}}function ce(e,t){return{async*[Symbol.asyncIterator](){try{let n=``;for await(let r of e)if(n+=r,n.indexOf(t)>-1){let e=n.lastIndexOf(t),r=n.slice(0,e).split(t).filter(e=>e.trim().length>0).map(e=>e.slice(e.indexOf(b)+b.length).trim());r.length>0&&(yield r),n=n.slice(e+t.length),n.trim()===`--`&&(n=``)}}catch(e){throw Error(`Error occured while processing stream payload - ${S(e)}`)}}}}function le(e){return{async*[Symbol.asyncIterator](){try{yield{...await A(e),hasNext:!1}}catch(t){yield{errors:{message:x(S(t)),networkStatusCode:e.status,response:e},hasNext:!1}}}}}function ue(e){return e.map(e=>{try{return JSON.parse(e)}catch(e){throw Error(`Error in parsing multipart response - ${S(e)}`)}}).map(e=>{let{data:t,incremental:n,hasNext:r,extensions:i,errors:a}=e;if(!n)return{data:t||{},...E(`errors`,a),...E(`extensions`,i),hasNext:r};let o=n.map(({data:e,path:t,errors:n})=>({data:e&&t?D(t,e):{},...E(`errors`,n)}));return{data:o.length===1?o[0].data:k(o.map(({data:e})=>e)),...E(`errors`,w(o)),hasNext:r}})}function de(e,t){if(e.length>0)throw Error(l,{cause:{graphQLErrors:e}});if(Object.keys(t).length===0)throw Error(d)}function fe(e,t){let n=(t??``).match(ee),r=`--${n?n[1]:`-`}`;if(!e.body?.getReader&&!e.body?.[Symbol.asyncIterator])throw Error(`API multipart response did not return an iterable body`,{cause:e});let i=se(e),a={},o;return{async*[Symbol.asyncIterator](){try{let e=!0;for await(let t of ce(i,r)){let n=ue(t);o=n.find(e=>e.extensions)?.extensions??o;let r=w(n);a=k([a,...n.map(({data:e})=>e)]),e=n.slice(-1)[0].hasNext,de(r,a),yield{...E(`data`,a),...E(`extensions`,o),hasNext:e}}if(e)throw Error(`Response stream terminated unexpectedly`)}catch(t){let n=C(t);yield{...E(`data`,a),...E(`extensions`,o),errors:{message:x(S(t)),networkStatusCode:e.status,...E(`graphQLErrors`,n?.graphQLErrors),response:e},hasNext:!1}}}}}function pe(e){return async(...t)=>{if(!y.test(t[0]))throw Error(x(`This operation does not result in a streamable response - use request() instead.`));try{let n=await e(...t),{statusText:r}=n;if(!n.ok)throw Error(r,{cause:n});let i=n.headers.get(`content-type`)||``;switch(!0){case i.includes(f.json):return le(n);case i.includes(f.multipart):return fe(n,i);default:throw Error(`${u} ${i}`,{cause:n})}}catch(e){return{async*[Symbol.asyncIterator](){let t=C(e);yield{errors:{message:x(S(e)),...E(`networkStatusCode`,t?.status),...E(`response`,t)},hasNext:!1}}}}}}function me({client:e,storeDomain:t}){try{if(!t||typeof t!=`string`)throw Error();let e=t.trim(),n=e.match(/^https?:/)?e:`https://${e}`,r=new URL(n);return r.protocol=`https`,r.origin}catch(n){throw Error(`${e}: a valid store domain ("${t}") must be provided`,{cause:n})}}function j({client:e,currentSupportedApiVersions:t,apiVersion:n,logger:r}){let i=`${e}: the provided apiVersion ("${n}")`,a=`Currently supported API versions: ${t.join(`, `)}`;if(!n||typeof n!=`string`)throw Error(`${i} is invalid. ${a}`);let o=n.trim();t.includes(o)||(r?r({type:`Unsupported_Api_Version`,content:{apiVersion:n,supportedApiVersions:t}}):console.warn(`${i} is likely deprecated or not supported. ${a}`))}function M(e){let t=e*3-2;return t===10?t:`0${t}`}function N(e,t,n){let r=t-n;return r<=0?`${e-1}-${M(r+4)}`:`${e}-${M(r)}`}function he(){let e=new Date,t=e.getUTCMonth(),n=e.getUTCFullYear(),r=Math.floor(t/3+1);return{year:n,quarter:r,version:`${n}-${M(r)}`}}function ge(){let{year:e,quarter:t,version:n}=he(),r=t===4?`${e+1}-01`:`${e}-${M(t+1)}`;return[N(e,t,3),N(e,t,2),N(e,t,1),n,r,`unstable`]}function _e(e){return t=>({...t,...e.headers})}function ve({getHeaders:e,getApiUrl:t}){return(n,r)=>{let i=[n];if(r&&Object.keys(r).length>0){let{variables:n,apiVersion:a,headers:o,retries:s,signal:c}=r;i.push({...n?{variables:n}:{},...o?{headers:e(o)}:{},...a?{url:t(a)}:{},...s?{retries:s}:{},...c?{signal:c}:{}})}return i}}var P=`application/json`,ye=`storefront-api-client`,be=`2.0.0`,xe=`X-Shopify-Storefront-Access-Token`,Se=`Shopify-Storefront-Private-Token`,Ce=`X-SDK-Variant`,we=`X-SDK-Version`,Te=`X-SDK-Variant-Source`,F=`Storefront API Client`;function Ee(e){if(e&&typeof window<`u`)throw Error(`${F}: private access tokens and headers should only be used in a server-to-server implementation. Use the public API access token in nonserver environments.`)}function De(e,t){if(!e&&!t)throw Error(`${F}: a public or private access token must be provided`);if(e&&t)throw Error(`${F}: only provide either a public or private access token`)}function I({storeDomain:e,apiVersion:t,publicAccessToken:n,privateAccessToken:r,clientName:i,retries:a=0,customFetchApi:o,logger:s}){let c=ge(),l=me({client:F,storeDomain:e}),u={client:F,currentSupportedApiVersions:c,logger:s};j({...u,apiVersion:t}),De(n,r),Ee(r);let d=Oe(l,t,u),f={storeDomain:l,apiVersion:t,...n?{publicAccessToken:n}:{privateAccessToken:r},headers:{"Content-Type":P,Accept:P,[Ce]:ye,[we]:be,...i?{[Te]:i}:{},...n?{[xe]:n}:{[Se]:r}},apiUrl:d(),clientName:i},p=re({headers:f.headers,url:f.apiUrl,retries:a,customFetchApi:o,logger:s}),m=_e(f),h=ke(f,d),g=ve({getHeaders:m,getApiUrl:h});return Object.freeze({config:f,getHeaders:m,getApiUrl:h,fetch:(...e)=>p.fetch(...g(...e)),request:(...e)=>p.request(...g(...e)),requestStream:(...e)=>p.requestStream(...g(...e))})}function Oe(e,t,n){return r=>(r&&j({...n,apiVersion:r}),`${e}/api/${(r??t).trim()}/graphql.json`)}function ke(e,t){return n=>n?t(n):e.apiUrl}var Ae=e({addCartLines:()=>rt,createCart:()=>et,displayVariantTitle:()=>K,fetchCart:()=>tt,fetchProductByHandle:()=>$,fetchProducts:()=>Xe,filterProductsByCategory:()=>n,findVariantForSize:()=>q,formatPrice:()=>W,getPlaceholderProductImage:()=>t,isShopifyConfigured:()=>R,placeholderProducts:()=>r,prefetchProductByHandle:()=>Qe,removeCartLines:()=>at,shopifyClient:()=>z,sortProductsBySubcategory:()=>a,subscribeToNewsletter:()=>Ye,updateCartAttributes:()=>nt,updateCartLines:()=>it}),je=`chrgrk-ff.myshopify.com`,L=`74da1c5612402e39f8641e752b6256c2`,Me=`2025-01`,R=!!L,z=R?I({storeDomain:je,apiVersion:Me,publicAccessToken:L}):null,B=R?I({storeDomain:je,apiVersion:`unstable`,publicAccessToken:L}):null,V=`
  id
  handle
  title
  description
  availableForSale
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
  variants(first: 20) {
    nodes {
      id
      title
      availableForSale
    }
  }
`,Ne=`#graphql
  query Products($first: Int!) {
    products(first: $first) {
      edges {
        node {
          ${V}
        }
      }
    }
  }
`,Pe=`#graphql
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      ${V}
    }
  }
`,H=`
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
  discountCodes {
    code
    applicable
  }
  discountAllocations {
    discountedAmount {
      amount
      currencyCode
    }
    ... on CartAutomaticDiscountAllocation {
      title
    }
    ... on CartCodeDiscountAllocation {
      code
    }
    ... on CartCustomDiscountAllocation {
      title
    }
  }
  lines(first: 100) {
    nodes {
      id
      quantity
      cost {
        totalAmount {
          amount
          currencyCode
        }
        amountPerQuantity {
          amount
          currencyCode
        }
      }
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
            id
            title
            handle
          }
        }
      }
    }
  }
`,Fe=`#graphql
  mutation CartCreate(
    $lines: [CartLineInput!]
    $attributes: [AttributeInput!]
    $buyerIdentity: CartBuyerIdentityInput
  ) {
    cartCreate(input: { lines: $lines, attributes: $attributes, buyerIdentity: $buyerIdentity }) {
      cart {
        ${H}
      }
      userErrors {
        field
        message
      }
    }
  }
`,Ie=`#graphql
  mutation CartAttributesUpdate($cartId: ID!, $attributes: [AttributeInput!]!) {
    cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
      cart {
        ${H}
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
      ${H}
    }
  }
`,Re=`#graphql
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ${H}
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
        ${H}
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
        ${H}
      }
      userErrors {
        field
        message
      }
    }
  }
`;function U(e){if(!e?.amount)return 0;let t=Number(e.amount);return Number.isFinite(t)?t:0}function Ve(e,t){let n=(e.discountAllocations??[]).map(e=>{let n=U(e.discountedAmount);return n<=0?null:{title:e.code?.trim()||e.title?.trim()||`Discount`,amountValue:n,amount:W(String(n),e.discountedAmount.currencyCode||t)}}).filter(e=>e!=null);if(n.length>0)return n;let r=U(e.cost.subtotalAmount),i=U(e.cost.totalAmount),a=Math.round((r-i)*100)/100;return a<=0?[]:[{title:((e.discountCodes??[]).find(e=>e.applicable)?.code)?.trim()||`Discount`,amountValue:a,amount:W(String(a),t)}]}function W(e,t){return new Intl.NumberFormat(`en-US`,{style:`currency`,currency:t}).format(Number(e))}function He(e,t){let n=[],r=new Set;for(let i of[...e??[],...t??[]])if(i.url&&!r.has(i.url)&&(r.add(i.url),n.push(i),n.length>=5))break;return n.length>0?n:void 0}function Ue(e){let t=i(e.handle);if(!t)return e;let n=o(t),r=e.images?.length?e.images:He(e.images,n.images);return{...n,...e,id:e.id,price:e.price,imageUrl:r?.[0]?.url??e.imageUrl??n.imageUrl,imageAlt:r?.[0]?.alt??e.imageAlt??n.imageAlt,images:r,variantId:e.variantId,variants:e.variants,description:e.description||n.description,material:n.material,category:n.category,subcategory:n.subcategory,features:n.features,keyFeatures:n.keyFeatures,dimensionsDisplay:n.dimensionsDisplay}}function G(e){let{amount:t,currencyCode:n}=e.priceRange.minVariantPrice,r=e.images?.nodes.map(t=>({url:t.url,alt:t.altText??e.title}))??[],i=e.featuredImage?[{url:e.featuredImage.url,alt:e.featuredImage.altText??e.title}]:[],a=r.length>0?r:i;return Ue({id:e.id,handle:e.handle,title:e.title,description:e.description,price:W(t,n),priceAmount:t,currencyCode:n,availableForSale:e.availableForSale??void 0,imageUrl:a[0]?.url??e.featuredImage?.url,imageAlt:a[0]?.alt??e.featuredImage?.altText??e.title,images:a.length>0?a:void 0,variantId:e.variants?.nodes?.[0]?.id,variants:e.variants?.nodes?.map(e=>({id:e.id,title:e.title??``,availableForSale:e.availableForSale??!0}))})}var We=`Default Title`;function K(e){let t=e?.trim();if(t&&t!==We)return t}function q(e,t){if(!e?.length)return;let n=J(t);return e.find(e=>J(e.title)===n)}var Ge={small:`s`,medium:`m`,large:`l`,"x-large":`xl`,"extra large":`xl`,xlarge:`xl`,"xx-large":`xxl`,"2xl":`xxl`};function J(e){let t=e.trim().toLowerCase();return Ge[t]??t}function Y(e){let t=e.cost.totalAmount.currencyCode||e.cost.subtotalAmount.currencyCode,n=U(e.cost.subtotalAmount),r=U(e.cost.totalAmount);return{id:e.id,checkoutUrl:e.checkoutUrl,totalQuantity:e.totalQuantity,subtotal:W(e.cost.subtotalAmount.amount,t),total:W(e.cost.totalAmount.amount,t),subtotalAmount:n,totalAmount:r,currencyCode:t,discounts:Ve(e,t),lines:e.lines.nodes.map(e=>{let t=e.cost?.amountPerQuantity??e.merchandise.price,n=e.cost?.totalAmount??{amount:String(U(t)*e.quantity),currencyCode:t.currencyCode};return{id:e.id,quantity:e.quantity,title:e.merchandise.product.title,handle:e.merchandise.product.handle,variantId:e.merchandise.id,variantTitle:K(e.merchandise.title),productId:e.merchandise.product.id,price:W(t.amount,t.currencyCode),lineTotal:W(n.amount,n.currencyCode),imageUrl:e.merchandise.image?.url,imageAlt:e.merchandise.image?.altText??e.merchandise.product.title}})}}function X(e,t){return e?.length?e.map(e=>e.message).join(`; `):t}var Ke=`#graphql
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
`,Z=`sr_subscriber_email`;function qe(){try{return window.localStorage.getItem(Z)}catch{return null}}function Je(e){try{window.localStorage.setItem(Z,e)}catch{}}async function Ye(e){let t=e.trim();if(!t)throw Error(`Enter an email address to subscribe.`);if(!B)throw Error(`Newsletter signup is unavailable right now.`);let{data:n,errors:r}=await B.request(Ke,{variables:{email:t}}),i=n?.customerEmailMarketingSubscribe;if(r||!i)throw Error(`Unable to subscribe right now. Please try again.`);if(i.customerUserErrors?.length)throw Error(X(i.customerUserErrors,`Unable to subscribe right now. Please try again.`));Je(t)}async function Xe(e=12){if(!z)return[];let{data:t,errors:n}=await z.request(Ne,{variables:{first:e}});return n?(console.error(`Shopify products query failed`,n),[]):Ze(t?.products?.edges?.map(e=>G(e.node))??[])}function Ze(e){let t=new Set(e.map(e=>e.handle)),n=r.filter(e=>!t.has(e.handle));return[...e,...n]}var Q=new Map;function Qe(e){$(e)}async function $(e){let t=Q.get(e);if(t)return t;let n=$e(e).then(t=>(t||Q.delete(e),t));return Q.set(e,n),n}async function $e(e){if(!z)return null;let{data:t,errors:n}=await z.request(Pe,{variables:{handle:e}});return n||!t?.product?(console.error(`Shopify product query failed`,n),null):G(t.product)}async function et(e=[],t=[]){if(!z)throw Error(`Shopify is not configured`);let n=qe(),{data:r,errors:i}=await z.request(Fe,{variables:{lines:e,attributes:t,buyerIdentity:n?{email:n}:void 0},headers:s()}),a=r?.cartCreate;if(i||!a?.cart)throw Error(X(a?.userErrors,`Unable to create cart`));if(a.userErrors?.length)throw Error(X(a.userErrors,`Unable to create cart`));return Y(a.cart)}async function tt(e){if(!z)return null;let{data:t,errors:n}=await z.request(Le,{variables:{id:e},headers:s()});return n?(console.error(`Shopify cart query failed`,n),null):t?.cart?Y(t.cart):null}async function nt(e,t){if(!z)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await z.request(Ie,{variables:{cartId:e,attributes:t},headers:s()}),i=n?.cartAttributesUpdate;if(r||!i?.cart||i.userErrors?.length)throw Error(X(i?.userErrors,`Unable to update cart`));return Y(i.cart)}async function rt(e,t){if(!z)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await z.request(Re,{variables:{cartId:e,lines:t},headers:s()}),i=n?.cartLinesAdd;if(r||!i?.cart)throw Error(X(i?.userErrors,`Unable to add to cart`));if(i.userErrors?.length)throw Error(X(i.userErrors,`Unable to add to cart`));return Y(i.cart)}async function it(e,t){if(!z)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await z.request(ze,{variables:{cartId:e,lines:t},headers:s()}),i=n?.cartLinesUpdate;if(r||!i?.cart)throw Error(X(i?.userErrors,`Unable to update cart`));if(i.userErrors?.length)throw Error(X(i.userErrors,`Unable to update cart`));return Y(i.cart)}async function at(e,t){if(!z)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await z.request(Be,{variables:{cartId:e,lineIds:t},headers:s()}),i=n?.cartLinesRemove;if(r||!i?.cart)throw Error(X(i?.userErrors,`Unable to remove from cart`));if(i.userErrors?.length)throw Error(X(i.userErrors,`Unable to remove from cart`));return Y(i.cart)}export{R as a,W as i,$ as n,Ae as o,q as r,K as t};