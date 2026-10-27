import{i as e,n as t,o as n,r,s as i,t as a}from"./product-catalog-2w85V9bL.js";var o=`GraphQL Client`,s=`An error occurred while fetching from the API. Review 'graphQLErrors' for details.`,c=`Response returned unexpected Content-Type:`,l=`An unknown error has occurred. The API did not return a data object or any errors in its response.`,u={json:`application/json`,multipart:`multipart/mixed`},d=`X-SDK-Variant`,f=`X-SDK-Version`,p=`shopify-graphql-client`,m=`2.0.0`,h=1e3,g=[429,503],_=/@(defer)\b/i,v=/boundary="?([^=";]+)"?/i,y=`\r
\r
`;function b(e,t=o){return e.startsWith(`${t}`)?e:`${t}: ${e}`}function x(e){return e instanceof Error?e.message:JSON.stringify(e)}function S(e){return e instanceof Error&&e.cause?e.cause:void 0}function C(e){return e.flatMap(({errors:e})=>e??[])}function w({client:e,retries:t}){if(t!==void 0&&(typeof t!=`number`||t<0||t>3))throw Error(`${e}: The provided "retries" value (${t}) is invalid - it cannot be less than 0 or greater than 3`)}function T(e,t){return t&&(typeof t!=`object`||Array.isArray(t)||typeof t==`object`&&Object.keys(t).length>0)?{[e]:t}:{}}function E(e,t){if(e.length===0)return t;let n={[e.pop()]:t};return e.length===0?n:E(e,n)}function D(e,t){return Object.keys(t||{}).reduce((n,r)=>(typeof t[r]==`object`||Array.isArray(t[r]))&&e[r]?(n[r]=D(e[r],t[r]),n):(n[r]=t[r],n),Array.isArray(e)?[...e]:{...e})}function O([e,...t]){return t.reduce(D,{...e})}function ee({clientLogger:e,customFetchApi:t=fetch,client:n=o,defaultRetryWaitTime:r=h,retriableCodes:i=g}){let a=async(o,s,c)=>{let l=s+1,u=c+1,d;try{if(d=await t(...o),e({type:`HTTP-Response`,content:{requestParams:o,response:d}}),!d.ok&&i.includes(d.status)&&l<=u)throw Error();let n=d?.headers.get(`X-Shopify-API-Deprecated-Reason`)||``;return n&&e({type:`HTTP-Response-GraphQL-Deprecation-Notice`,content:{requestParams:o,deprecationNotice:n}}),d}catch(t){if(l<=u){let t=d?.headers.get(`Retry-After`);return await te(t?parseInt(t,10):r),e({type:`HTTP-Retry`,content:{requestParams:o,lastResponse:d,retryAttempt:s,maxRetries:c}}),a(o,l,c)}throw Error(b(`${c>0?`Attempted maximum number of ${c} network retries. Last message - `:``}${x(t)}`,n))}};return a}async function te(e){return new Promise(t=>setTimeout(t,e))}function ne({headers:e,url:t,customFetchApi:n=fetch,retries:r=0,logger:i}){w({client:o,retries:r});let a={headers:e,url:t,retries:r},s=ie(ee({customFetchApi:n,clientLogger:re(i),defaultRetryWaitTime:h}),a);return{config:a,fetch:s,request:ae(s),requestStream:fe(s)}}function re(e){return t=>{e&&e(t)}}async function k(e){let{errors:t,data:n,extensions:r}=await e.json();return{...T(`data`,n),...T(`extensions`,r),headers:e.headers,...t||!n?{errors:{networkStatusCode:e.status,message:b(t?s:l),...T(`graphQLErrors`,t),response:e}}:{}}}function ie(e,{url:t,headers:n,retries:r}){return async(i,a={})=>{let{variables:s,headers:c,url:l,retries:u,keepalive:h,signal:g}=a,_=JSON.stringify({query:i,variables:s});w({client:o,retries:u});let v=Object.entries({...n,...c}).reduce((e,[t,n])=>(e[t]=Array.isArray(n)?n.join(`, `):n.toString(),e),{});return!v[`X-SDK-Variant`]&&!v[`X-SDK-Version`]&&(v[d]=p,v[f]=m),e([l??t,{method:`POST`,headers:v,body:_,signal:g,keepalive:h}],1,u??r)}}function ae(e){return async(...t)=>{if(_.test(t[0]))throw Error(b(`This operation will result in a streamable response - use requestStream() instead.`));let n=null;try{n=await e(...t);let{status:r,statusText:i}=n,a=n.headers.get(`content-type`)||``;return n.ok?a.includes(u.json)?await k(n):{errors:{networkStatusCode:r,message:b(`${c} ${a}`),response:n}}:{errors:{networkStatusCode:r,message:b(i),response:n}}}catch(e){return{errors:{message:x(e),...n==null?{}:{networkStatusCode:n.status,response:n}}}}}}async function*oe(e){let t=new TextDecoder;if(e.body[Symbol.asyncIterator])for await(let n of e.body)yield t.decode(n);else{let n=e.body.getReader(),r;try{for(;!(r=await n.read()).done;)yield t.decode(r.value)}finally{n.cancel()}}}function se(e,t){return{async*[Symbol.asyncIterator](){try{let n=``;for await(let r of e)if(n+=r,n.indexOf(t)>-1){let e=n.lastIndexOf(t),r=n.slice(0,e).split(t).filter(e=>e.trim().length>0).map(e=>e.slice(e.indexOf(y)+y.length).trim());r.length>0&&(yield r),n=n.slice(e+t.length),n.trim()===`--`&&(n=``)}}catch(e){throw Error(`Error occured while processing stream payload - ${x(e)}`)}}}}function ce(e){return{async*[Symbol.asyncIterator](){try{yield{...await k(e),hasNext:!1}}catch(t){yield{errors:{message:b(x(t)),networkStatusCode:e.status,response:e},hasNext:!1}}}}}function le(e){return e.map(e=>{try{return JSON.parse(e)}catch(e){throw Error(`Error in parsing multipart response - ${x(e)}`)}}).map(e=>{let{data:t,incremental:n,hasNext:r,extensions:i,errors:a}=e;if(!n)return{data:t||{},...T(`errors`,a),...T(`extensions`,i),hasNext:r};let o=n.map(({data:e,path:t,errors:n})=>({data:e&&t?E(t,e):{},...T(`errors`,n)}));return{data:o.length===1?o[0].data:O(o.map(({data:e})=>e)),...T(`errors`,C(o)),hasNext:r}})}function ue(e,t){if(e.length>0)throw Error(s,{cause:{graphQLErrors:e}});if(Object.keys(t).length===0)throw Error(l)}function de(e,t){let n=(t??``).match(v),r=`--${n?n[1]:`-`}`;if(!e.body?.getReader&&!e.body?.[Symbol.asyncIterator])throw Error(`API multipart response did not return an iterable body`,{cause:e});let i=oe(e),a={},o;return{async*[Symbol.asyncIterator](){try{let e=!0;for await(let t of se(i,r)){let n=le(t);o=n.find(e=>e.extensions)?.extensions??o;let r=C(n);a=O([a,...n.map(({data:e})=>e)]),e=n.slice(-1)[0].hasNext,ue(r,a),yield{...T(`data`,a),...T(`extensions`,o),hasNext:e}}if(e)throw Error(`Response stream terminated unexpectedly`)}catch(t){let n=S(t);yield{...T(`data`,a),...T(`extensions`,o),errors:{message:b(x(t)),networkStatusCode:e.status,...T(`graphQLErrors`,n?.graphQLErrors),response:e},hasNext:!1}}}}}function fe(e){return async(...t)=>{if(!_.test(t[0]))throw Error(b(`This operation does not result in a streamable response - use request() instead.`));try{let n=await e(...t),{statusText:r}=n;if(!n.ok)throw Error(r,{cause:n});let i=n.headers.get(`content-type`)||``;switch(!0){case i.includes(u.json):return ce(n);case i.includes(u.multipart):return de(n,i);default:throw Error(`${c} ${i}`,{cause:n})}}catch(e){return{async*[Symbol.asyncIterator](){let t=S(e);yield{errors:{message:b(x(e)),...T(`networkStatusCode`,t?.status),...T(`response`,t)},hasNext:!1}}}}}}function pe({client:e,storeDomain:t}){try{if(!t||typeof t!=`string`)throw Error();let e=t.trim(),n=e.match(/^https?:/)?e:`https://${e}`,r=new URL(n);return r.protocol=`https`,r.origin}catch(n){throw Error(`${e}: a valid store domain ("${t}") must be provided`,{cause:n})}}function A({client:e,currentSupportedApiVersions:t,apiVersion:n,logger:r}){let i=`${e}: the provided apiVersion ("${n}")`,a=`Currently supported API versions: ${t.join(`, `)}`;if(!n||typeof n!=`string`)throw Error(`${i} is invalid. ${a}`);let o=n.trim();t.includes(o)||(r?r({type:`Unsupported_Api_Version`,content:{apiVersion:n,supportedApiVersions:t}}):console.warn(`${i} is likely deprecated or not supported. ${a}`))}function j(e){let t=e*3-2;return t===10?t:`0${t}`}function M(e,t,n){let r=t-n;return r<=0?`${e-1}-${j(r+4)}`:`${e}-${j(r)}`}function me(){let e=new Date,t=e.getUTCMonth(),n=e.getUTCFullYear(),r=Math.floor(t/3+1);return{year:n,quarter:r,version:`${n}-${j(r)}`}}function he(){let{year:e,quarter:t,version:n}=me(),r=t===4?`${e+1}-01`:`${e}-${j(t+1)}`;return[M(e,t,3),M(e,t,2),M(e,t,1),n,r,`unstable`]}function ge(e){return t=>({...t,...e.headers})}function _e({getHeaders:e,getApiUrl:t}){return(n,r)=>{let i=[n];if(r&&Object.keys(r).length>0){let{variables:n,apiVersion:a,headers:o,retries:s,signal:c}=r;i.push({...n?{variables:n}:{},...o?{headers:e(o)}:{},...a?{url:t(a)}:{},...s?{retries:s}:{},...c?{signal:c}:{}})}return i}}var N=`application/json`,ve=`storefront-api-client`,P=`2.0.0`,F=`X-Shopify-Storefront-Access-Token`,ye=`Shopify-Storefront-Private-Token`,be=`X-SDK-Variant`,xe=`X-SDK-Version`,Se=`X-SDK-Variant-Source`,I=`Storefront API Client`;function Ce(e){if(e&&typeof window<`u`)throw Error(`${I}: private access tokens and headers should only be used in a server-to-server implementation. Use the public API access token in nonserver environments.`)}function we(e,t){if(!e&&!t)throw Error(`${I}: a public or private access token must be provided`);if(e&&t)throw Error(`${I}: only provide either a public or private access token`)}function L({storeDomain:e,apiVersion:t,publicAccessToken:n,privateAccessToken:r,clientName:i,retries:a=0,customFetchApi:o,logger:s}){let c=he(),l=pe({client:I,storeDomain:e}),u={client:I,currentSupportedApiVersions:c,logger:s};A({...u,apiVersion:t}),we(n,r),Ce(r);let d=Te(l,t,u),f={storeDomain:l,apiVersion:t,...n?{publicAccessToken:n}:{privateAccessToken:r},headers:{"Content-Type":N,Accept:N,[be]:ve,[xe]:P,...i?{[Se]:i}:{},...n?{[F]:n}:{[ye]:r}},apiUrl:d(),clientName:i},p=ne({headers:f.headers,url:f.apiUrl,retries:a,customFetchApi:o,logger:s}),m=ge(f),h=Ee(f,d),g=_e({getHeaders:m,getApiUrl:h});return Object.freeze({config:f,getHeaders:m,getApiUrl:h,fetch:(...e)=>p.fetch(...g(...e)),request:(...e)=>p.request(...g(...e)),requestStream:(...e)=>p.requestStream(...g(...e))})}function Te(e,t,n){return r=>(r&&A({...n,apiVersion:r}),`${e}/api/${(r??t).trim()}/graphql.json`)}function Ee(e,t){return n=>n?t(n):e.apiUrl}var R=`chrgrk-ff.myshopify.com`,z=`74da1c5612402e39f8641e752b6256c2`,De=`2025-01`,B=!!z,V=B?L({storeDomain:R,apiVersion:De,publicAccessToken:z}):null,H=B?L({storeDomain:R,apiVersion:`unstable`,publicAccessToken:z}):null,U=`
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
`,Oe=`#graphql
  query Products($first: Int!) {
    products(first: $first) {
      edges {
        node {
          ${U}
        }
      }
    }
  }
`,ke=`#graphql
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      ${U}
    }
  }
`,W=`
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
            title
            handle
          }
        }
      }
    }
  }
`,Ae=`#graphql
  mutation CartCreate($lines: [CartLineInput!]) {
    cartCreate(input: { lines: $lines }) {
      cart {
        ${W}
      }
      userErrors {
        field
        message
      }
    }
  }
`,je=`#graphql
  query Cart($id: ID!) {
    cart(id: $id) {
      ${W}
    }
  }
`,Me=`#graphql
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ${W}
      }
      userErrors {
        field
        message
      }
    }
  }
`,Ne=`#graphql
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ${W}
      }
      userErrors {
        field
        message
      }
    }
  }
`,Pe=`#graphql
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        ${W}
      }
      userErrors {
        field
        message
      }
    }
  }
`;function G(e){if(!e?.amount)return 0;let t=Number(e.amount);return Number.isFinite(t)?t:0}function Fe(e,t){let n=(e.discountAllocations??[]).map(e=>{let n=G(e.discountedAmount);return n<=0?null:{title:e.code?.trim()||e.title?.trim()||`Discount`,amountValue:n,amount:K(String(n),e.discountedAmount.currencyCode||t)}}).filter(e=>e!=null);if(n.length>0)return n;let r=G(e.cost.subtotalAmount),i=G(e.cost.totalAmount),a=Math.round((r-i)*100)/100;return a<=0?[]:[{title:((e.discountCodes??[]).find(e=>e.applicable)?.code)?.trim()||`Discount`,amountValue:a,amount:K(String(a),t)}]}function K(e,t){return new Intl.NumberFormat(`en-US`,{style:`currency`,currency:t}).format(Number(e))}function Ie(e,t){let n=[],r=new Set;for(let i of[...e??[],...t??[]])if(i.url&&!r.has(i.url)&&(r.add(i.url),n.push(i),n.length>=5))break;return n.length>0?n:void 0}function q(e,t=0){let n=e[t];return t<=0||!n?e:[n,...e.filter((e,n)=>n!==t)]}function Le(e){let t=r(e.handle);if(!t)return e;let n=a(t),i=e.images?.length?q(e.images,t.frontImageIndex):Ie(e.images,n.images);return{...n,...e,id:e.id,price:e.price,imageUrl:i?.[0]?.url??e.imageUrl??n.imageUrl,imageAlt:i?.[0]?.alt??e.imageAlt??n.imageAlt,images:i,variantId:e.variantId,description:e.description||n.description,material:n.material,category:n.category,subcategory:n.subcategory,features:n.features,keyFeatures:n.keyFeatures,dimensionsDisplay:n.dimensionsDisplay}}function J(e){let{amount:t,currencyCode:n}=e.priceRange.minVariantPrice,r=e.images?.nodes.map(t=>({url:t.url,alt:t.altText??e.title}))??[],i=e.featuredImage?[{url:e.featuredImage.url,alt:e.featuredImage.altText??e.title}]:[],a=r.length>0?r:i;return Le({id:e.id,handle:e.handle,title:e.title,description:e.description,price:K(t,n),imageUrl:a[0]?.url??e.featuredImage?.url,imageAlt:a[0]?.alt??e.featuredImage?.altText??e.title,images:a.length>0?a:void 0,variantId:e.variants?.nodes?.[0]?.id})}function Y(e){let t=e.cost.totalAmount.currencyCode||e.cost.subtotalAmount.currencyCode,n=G(e.cost.subtotalAmount),r=G(e.cost.totalAmount);return{id:e.id,checkoutUrl:e.checkoutUrl,totalQuantity:e.totalQuantity,subtotal:K(e.cost.subtotalAmount.amount,t),total:K(e.cost.totalAmount.amount,t),subtotalAmount:n,totalAmount:r,currencyCode:t,discounts:Fe(e,t),lines:e.lines.nodes.map(e=>{let t=e.cost?.amountPerQuantity??e.merchandise.price,n=e.cost?.totalAmount??{amount:String(G(t)*e.quantity),currencyCode:t.currencyCode};return{id:e.id,quantity:e.quantity,title:e.merchandise.product.title,handle:e.merchandise.product.handle,variantId:e.merchandise.id,price:K(t.amount,t.currencyCode),lineTotal:K(n.amount,n.currencyCode),imageUrl:e.merchandise.image?.url,imageAlt:e.merchandise.image?.altText??e.merchandise.product.title}})}}function X(e,t){return e?.length?e.map(e=>e.message).join(`; `):t}var Re=`#graphql
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
`;async function ze(e){let t=e.trim();if(!t)throw Error(`Enter an email address to subscribe.`);if(!H)throw Error(`Newsletter signup is unavailable right now.`);let{data:n,errors:r}=await H.request(Re,{variables:{email:t}}),i=n?.customerEmailMarketingSubscribe;if(r||!i)throw Error(`Unable to subscribe right now. Please try again.`);if(i.customerUserErrors?.length)throw Error(X(i.customerUserErrors,`Unable to subscribe right now. Please try again.`))}async function Be(e=12){if(!V)return[];let{data:t,errors:n}=await V.request(Oe,{variables:{first:e}});return n?(console.error(`Shopify products query failed`,n),[]):He(t?.products?.edges?.map(e=>Ve(J(e.node)))??[])}function Ve(e){let t=r(e.handle);if(!t?.images?.length)return e;let n=a(t);return{...e,imageUrl:n.imageUrl??e.imageUrl,imageAlt:n.imageAlt??e.imageAlt,images:n.images??e.images}}function He(e){let t=new Set(e.map(e=>e.handle)),r=n.filter(e=>!t.has(e.handle));return[...e,...r]}var Z=new Map;function Q(e){$(e)}async function $(e){let t=Z.get(e);if(t)return t;let n=Ue(e).then(t=>(t||Z.delete(e),t));return Z.set(e,n),n}async function Ue(e){if(!V)return null;let{data:t,errors:n}=await V.request(ke,{variables:{handle:e}});return n||!t?.product?(console.error(`Shopify product query failed`,n),null):J(t.product)}async function We(e=[]){if(!V)throw Error(`Shopify is not configured`);let{data:t,errors:n}=await V.request(Ae,{variables:{lines:e}}),r=t?.cartCreate;if(n||!r?.cart)throw Error(X(r?.userErrors,`Unable to create cart`));if(r.userErrors?.length)throw Error(X(r.userErrors,`Unable to create cart`));return Y(r.cart)}async function Ge(e){if(!V)return null;let{data:t,errors:n}=await V.request(je,{variables:{id:e}});return n?(console.error(`Shopify cart query failed`,n),null):t?.cart?Y(t.cart):null}async function Ke(e,t){if(!V)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await V.request(Me,{variables:{cartId:e,lines:t}}),i=n?.cartLinesAdd;if(r||!i?.cart)throw Error(X(i?.userErrors,`Unable to add to cart`));if(i.userErrors?.length)throw Error(X(i.userErrors,`Unable to add to cart`));return Y(i.cart)}async function qe(e,t){if(!V)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await V.request(Ne,{variables:{cartId:e,lines:t}}),i=n?.cartLinesUpdate;if(r||!i?.cart)throw Error(X(i?.userErrors,`Unable to update cart`));if(i.userErrors?.length)throw Error(X(i.userErrors,`Unable to update cart`));return Y(i.cart)}async function Je(e,t){if(!V)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await V.request(Pe,{variables:{cartId:e,lineIds:t}}),i=n?.cartLinesRemove;if(r||!i?.cart)throw Error(X(i?.userErrors,`Unable to remove from cart`));if(i.userErrors?.length)throw Error(X(i.userErrors,`Unable to remove from cart`));return Y(i.cart)}export{Ke as addCartLines,We as createCart,Ge as fetchCart,$ as fetchProductByHandle,Be as fetchProducts,t as filterProductsByCategory,K as formatPrice,e as getPlaceholderProductImage,B as isShopifyConfigured,q as moveFrontImageFirst,n as placeholderProducts,Q as prefetchProductByHandle,Je as removeCartLines,V as shopifyClient,i as sortProductsBySubcategory,ze as subscribeToNewsletter,qe as updateCartLines};