import{i as e,n as t,o as n,r,s as i,t as a}from"./product-catalog-DEvjdkt1.js";import{n as o}from"./shopifyAnalytics-J3g6GWF2.js";var s=`GraphQL Client`,c=`An error occurred while fetching from the API. Review 'graphQLErrors' for details.`,l=`Response returned unexpected Content-Type:`,u=`An unknown error has occurred. The API did not return a data object or any errors in its response.`,d={json:`application/json`,multipart:`multipart/mixed`},f=`X-SDK-Variant`,p=`X-SDK-Version`,m=`shopify-graphql-client`,h=`2.0.0`,g=1e3,_=[429,503],v=/@(defer)\b/i,ee=/boundary="?([^=";]+)"?/i,y=`\r
\r
`;function b(e,t=s){return e.startsWith(`${t}`)?e:`${t}: ${e}`}function x(e){return e instanceof Error?e.message:JSON.stringify(e)}function S(e){return e instanceof Error&&e.cause?e.cause:void 0}function C(e){return e.flatMap(({errors:e})=>e??[])}function w({client:e,retries:t}){if(t!==void 0&&(typeof t!=`number`||t<0||t>3))throw Error(`${e}: The provided "retries" value (${t}) is invalid - it cannot be less than 0 or greater than 3`)}function T(e,t){return t&&(typeof t!=`object`||Array.isArray(t)||typeof t==`object`&&Object.keys(t).length>0)?{[e]:t}:{}}function E(e,t){if(e.length===0)return t;let n={[e.pop()]:t};return e.length===0?n:E(e,n)}function D(e,t){return Object.keys(t||{}).reduce((n,r)=>(typeof t[r]==`object`||Array.isArray(t[r]))&&e[r]?(n[r]=D(e[r],t[r]),n):(n[r]=t[r],n),Array.isArray(e)?[...e]:{...e})}function O([e,...t]){return t.reduce(D,{...e})}function te({clientLogger:e,customFetchApi:t=fetch,client:n=s,defaultRetryWaitTime:r=g,retriableCodes:i=_}){let a=async(o,s,c)=>{let l=s+1,u=c+1,d;try{if(d=await t(...o),e({type:`HTTP-Response`,content:{requestParams:o,response:d}}),!d.ok&&i.includes(d.status)&&l<=u)throw Error();let n=d?.headers.get(`X-Shopify-API-Deprecated-Reason`)||``;return n&&e({type:`HTTP-Response-GraphQL-Deprecation-Notice`,content:{requestParams:o,deprecationNotice:n}}),d}catch(t){if(l<=u){let t=d?.headers.get(`Retry-After`);return await ne(t?parseInt(t,10):r),e({type:`HTTP-Retry`,content:{requestParams:o,lastResponse:d,retryAttempt:s,maxRetries:c}}),a(o,l,c)}throw Error(b(`${c>0?`Attempted maximum number of ${c} network retries. Last message - `:``}${x(t)}`,n))}};return a}async function ne(e){return new Promise(t=>setTimeout(t,e))}function re({headers:e,url:t,customFetchApi:n=fetch,retries:r=0,logger:i}){w({client:s,retries:r});let a={headers:e,url:t,retries:r},o=ae(te({customFetchApi:n,clientLogger:ie(i),defaultRetryWaitTime:g}),a);return{config:a,fetch:o,request:oe(o),requestStream:pe(o)}}function ie(e){return t=>{e&&e(t)}}async function k(e){let{errors:t,data:n,extensions:r}=await e.json();return{...T(`data`,n),...T(`extensions`,r),headers:e.headers,...t||!n?{errors:{networkStatusCode:e.status,message:b(t?c:u),...T(`graphQLErrors`,t),response:e}}:{}}}function ae(e,{url:t,headers:n,retries:r}){return async(i,a={})=>{let{variables:o,headers:c,url:l,retries:u,keepalive:d,signal:g}=a,_=JSON.stringify({query:i,variables:o});w({client:s,retries:u});let v=Object.entries({...n,...c}).reduce((e,[t,n])=>(e[t]=Array.isArray(n)?n.join(`, `):n.toString(),e),{});return!v[`X-SDK-Variant`]&&!v[`X-SDK-Version`]&&(v[f]=m,v[p]=h),e([l??t,{method:`POST`,headers:v,body:_,signal:g,keepalive:d}],1,u??r)}}function oe(e){return async(...t)=>{if(v.test(t[0]))throw Error(b(`This operation will result in a streamable response - use requestStream() instead.`));let n=null;try{n=await e(...t);let{status:r,statusText:i}=n,a=n.headers.get(`content-type`)||``;return n.ok?a.includes(d.json)?await k(n):{errors:{networkStatusCode:r,message:b(`${l} ${a}`),response:n}}:{errors:{networkStatusCode:r,message:b(i),response:n}}}catch(e){return{errors:{message:x(e),...n==null?{}:{networkStatusCode:n.status,response:n}}}}}}async function*se(e){let t=new TextDecoder;if(e.body[Symbol.asyncIterator])for await(let n of e.body)yield t.decode(n);else{let n=e.body.getReader(),r;try{for(;!(r=await n.read()).done;)yield t.decode(r.value)}finally{n.cancel()}}}function ce(e,t){return{async*[Symbol.asyncIterator](){try{let n=``;for await(let r of e)if(n+=r,n.indexOf(t)>-1){let e=n.lastIndexOf(t),r=n.slice(0,e).split(t).filter(e=>e.trim().length>0).map(e=>e.slice(e.indexOf(y)+y.length).trim());r.length>0&&(yield r),n=n.slice(e+t.length),n.trim()===`--`&&(n=``)}}catch(e){throw Error(`Error occured while processing stream payload - ${x(e)}`)}}}}function le(e){return{async*[Symbol.asyncIterator](){try{yield{...await k(e),hasNext:!1}}catch(t){yield{errors:{message:b(x(t)),networkStatusCode:e.status,response:e},hasNext:!1}}}}}function ue(e){return e.map(e=>{try{return JSON.parse(e)}catch(e){throw Error(`Error in parsing multipart response - ${x(e)}`)}}).map(e=>{let{data:t,incremental:n,hasNext:r,extensions:i,errors:a}=e;if(!n)return{data:t||{},...T(`errors`,a),...T(`extensions`,i),hasNext:r};let o=n.map(({data:e,path:t,errors:n})=>({data:e&&t?E(t,e):{},...T(`errors`,n)}));return{data:o.length===1?o[0].data:O(o.map(({data:e})=>e)),...T(`errors`,C(o)),hasNext:r}})}function de(e,t){if(e.length>0)throw Error(c,{cause:{graphQLErrors:e}});if(Object.keys(t).length===0)throw Error(u)}function fe(e,t){let n=(t??``).match(ee),r=`--${n?n[1]:`-`}`;if(!e.body?.getReader&&!e.body?.[Symbol.asyncIterator])throw Error(`API multipart response did not return an iterable body`,{cause:e});let i=se(e),a={},o;return{async*[Symbol.asyncIterator](){try{let e=!0;for await(let t of ce(i,r)){let n=ue(t);o=n.find(e=>e.extensions)?.extensions??o;let r=C(n);a=O([a,...n.map(({data:e})=>e)]),e=n.slice(-1)[0].hasNext,de(r,a),yield{...T(`data`,a),...T(`extensions`,o),hasNext:e}}if(e)throw Error(`Response stream terminated unexpectedly`)}catch(t){let n=S(t);yield{...T(`data`,a),...T(`extensions`,o),errors:{message:b(x(t)),networkStatusCode:e.status,...T(`graphQLErrors`,n?.graphQLErrors),response:e},hasNext:!1}}}}}function pe(e){return async(...t)=>{if(!v.test(t[0]))throw Error(b(`This operation does not result in a streamable response - use request() instead.`));try{let n=await e(...t),{statusText:r}=n;if(!n.ok)throw Error(r,{cause:n});let i=n.headers.get(`content-type`)||``;switch(!0){case i.includes(d.json):return le(n);case i.includes(d.multipart):return fe(n,i);default:throw Error(`${l} ${i}`,{cause:n})}}catch(e){return{async*[Symbol.asyncIterator](){let t=S(e);yield{errors:{message:b(x(e)),...T(`networkStatusCode`,t?.status),...T(`response`,t)},hasNext:!1}}}}}}function me({client:e,storeDomain:t}){try{if(!t||typeof t!=`string`)throw Error();let e=t.trim(),n=e.match(/^https?:/)?e:`https://${e}`,r=new URL(n);return r.protocol=`https`,r.origin}catch(n){throw Error(`${e}: a valid store domain ("${t}") must be provided`,{cause:n})}}function A({client:e,currentSupportedApiVersions:t,apiVersion:n,logger:r}){let i=`${e}: the provided apiVersion ("${n}")`,a=`Currently supported API versions: ${t.join(`, `)}`;if(!n||typeof n!=`string`)throw Error(`${i} is invalid. ${a}`);let o=n.trim();t.includes(o)||(r?r({type:`Unsupported_Api_Version`,content:{apiVersion:n,supportedApiVersions:t}}):console.warn(`${i} is likely deprecated or not supported. ${a}`))}function j(e){let t=e*3-2;return t===10?t:`0${t}`}function M(e,t,n){let r=t-n;return r<=0?`${e-1}-${j(r+4)}`:`${e}-${j(r)}`}function he(){let e=new Date,t=e.getUTCMonth(),n=e.getUTCFullYear(),r=Math.floor(t/3+1);return{year:n,quarter:r,version:`${n}-${j(r)}`}}function ge(){let{year:e,quarter:t,version:n}=he(),r=t===4?`${e+1}-01`:`${e}-${j(t+1)}`;return[M(e,t,3),M(e,t,2),M(e,t,1),n,r,`unstable`]}function _e(e){return t=>({...t,...e.headers})}function ve({getHeaders:e,getApiUrl:t}){return(n,r)=>{let i=[n];if(r&&Object.keys(r).length>0){let{variables:n,apiVersion:a,headers:o,retries:s,signal:c}=r;i.push({...n?{variables:n}:{},...o?{headers:e(o)}:{},...a?{url:t(a)}:{},...s?{retries:s}:{},...c?{signal:c}:{}})}return i}}var N=`application/json`,P=`storefront-api-client`,F=`2.0.0`,ye=`X-Shopify-Storefront-Access-Token`,be=`Shopify-Storefront-Private-Token`,xe=`X-SDK-Variant`,Se=`X-SDK-Version`,Ce=`X-SDK-Variant-Source`,I=`Storefront API Client`;function we(e){if(e&&typeof window<`u`)throw Error(`${I}: private access tokens and headers should only be used in a server-to-server implementation. Use the public API access token in nonserver environments.`)}function Te(e,t){if(!e&&!t)throw Error(`${I}: a public or private access token must be provided`);if(e&&t)throw Error(`${I}: only provide either a public or private access token`)}function L({storeDomain:e,apiVersion:t,publicAccessToken:n,privateAccessToken:r,clientName:i,retries:a=0,customFetchApi:o,logger:s}){let c=ge(),l=me({client:I,storeDomain:e}),u={client:I,currentSupportedApiVersions:c,logger:s};A({...u,apiVersion:t}),Te(n,r),we(r);let d=Ee(l,t,u),f={storeDomain:l,apiVersion:t,...n?{publicAccessToken:n}:{privateAccessToken:r},headers:{"Content-Type":N,Accept:N,[xe]:P,[Se]:F,...i?{[Ce]:i}:{},...n?{[ye]:n}:{[be]:r}},apiUrl:d(),clientName:i},p=re({headers:f.headers,url:f.apiUrl,retries:a,customFetchApi:o,logger:s}),m=_e(f),h=De(f,d),g=ve({getHeaders:m,getApiUrl:h});return Object.freeze({config:f,getHeaders:m,getApiUrl:h,fetch:(...e)=>p.fetch(...g(...e)),request:(...e)=>p.request(...g(...e)),requestStream:(...e)=>p.requestStream(...g(...e))})}function Ee(e,t,n){return r=>(r&&A({...n,apiVersion:r}),`${e}/api/${(r??t).trim()}/graphql.json`)}function De(e,t){return n=>n?t(n):e.apiUrl}var R=`chrgrk-ff.myshopify.com`,z=`74da1c5612402e39f8641e752b6256c2`,Oe=`2025-01`,B=!!z,V=B?L({storeDomain:R,apiVersion:Oe,publicAccessToken:z}):null,H=B?L({storeDomain:R,apiVersion:`unstable`,publicAccessToken:z}):null,U=`
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
`,ke=`#graphql
  query Products($first: Int!) {
    products(first: $first) {
      edges {
        node {
          ${U}
        }
      }
    }
  }
`,Ae=`#graphql
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
            id
            title
            handle
          }
        }
      }
    }
  }
`,je=`#graphql
  mutation CartCreate(
    $lines: [CartLineInput!]
    $attributes: [AttributeInput!]
    $buyerIdentity: CartBuyerIdentityInput
  ) {
    cartCreate(input: { lines: $lines, attributes: $attributes, buyerIdentity: $buyerIdentity }) {
      cart {
        ${W}
      }
      userErrors {
        field
        message
      }
    }
  }
`,Me=`#graphql
  mutation CartAttributesUpdate($cartId: ID!, $attributes: [AttributeInput!]!) {
    cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
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
  query Cart($id: ID!) {
    cart(id: $id) {
      ${W}
    }
  }
`,Pe=`#graphql
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
`,Fe=`#graphql
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
`,Ie=`#graphql
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
`;function G(e){if(!e?.amount)return 0;let t=Number(e.amount);return Number.isFinite(t)?t:0}function Le(e,t){let n=(e.discountAllocations??[]).map(e=>{let n=G(e.discountedAmount);return n<=0?null:{title:e.code?.trim()||e.title?.trim()||`Discount`,amountValue:n,amount:K(String(n),e.discountedAmount.currencyCode||t)}}).filter(e=>e!=null);if(n.length>0)return n;let r=G(e.cost.subtotalAmount),i=G(e.cost.totalAmount),a=Math.round((r-i)*100)/100;return a<=0?[]:[{title:((e.discountCodes??[]).find(e=>e.applicable)?.code)?.trim()||`Discount`,amountValue:a,amount:K(String(a),t)}]}function K(e,t){return new Intl.NumberFormat(`en-US`,{style:`currency`,currency:t}).format(Number(e))}function Re(e,t){let n=[],r=new Set;for(let i of[...e??[],...t??[]])if(i.url&&!r.has(i.url)&&(r.add(i.url),n.push(i),n.length>=5))break;return n.length>0?n:void 0}function ze(e){let t=r(e.handle);if(!t)return e;let n=a(t),i=e.images?.length?e.images:Re(e.images,n.images);return{...n,...e,id:e.id,price:e.price,imageUrl:i?.[0]?.url??e.imageUrl??n.imageUrl,imageAlt:i?.[0]?.alt??e.imageAlt??n.imageAlt,images:i,variantId:e.variantId,description:e.description||n.description,material:n.material,category:n.category,subcategory:n.subcategory,features:n.features,keyFeatures:n.keyFeatures,dimensionsDisplay:n.dimensionsDisplay}}function q(e){let{amount:t,currencyCode:n}=e.priceRange.minVariantPrice,r=e.images?.nodes.map(t=>({url:t.url,alt:t.altText??e.title}))??[],i=e.featuredImage?[{url:e.featuredImage.url,alt:e.featuredImage.altText??e.title}]:[],a=r.length>0?r:i;return ze({id:e.id,handle:e.handle,title:e.title,description:e.description,price:K(t,n),imageUrl:a[0]?.url??e.featuredImage?.url,imageAlt:a[0]?.alt??e.featuredImage?.altText??e.title,images:a.length>0?a:void 0,variantId:e.variants?.nodes?.[0]?.id})}function J(e){let t=e.cost.totalAmount.currencyCode||e.cost.subtotalAmount.currencyCode,n=G(e.cost.subtotalAmount),r=G(e.cost.totalAmount);return{id:e.id,checkoutUrl:e.checkoutUrl,totalQuantity:e.totalQuantity,subtotal:K(e.cost.subtotalAmount.amount,t),total:K(e.cost.totalAmount.amount,t),subtotalAmount:n,totalAmount:r,currencyCode:t,discounts:Le(e,t),lines:e.lines.nodes.map(e=>{let t=e.cost?.amountPerQuantity??e.merchandise.price,n=e.cost?.totalAmount??{amount:String(G(t)*e.quantity),currencyCode:t.currencyCode};return{id:e.id,quantity:e.quantity,title:e.merchandise.product.title,handle:e.merchandise.product.handle,variantId:e.merchandise.id,productId:e.merchandise.product.id,price:K(t.amount,t.currencyCode),lineTotal:K(n.amount,n.currencyCode),imageUrl:e.merchandise.image?.url,imageAlt:e.merchandise.image?.altText??e.merchandise.product.title}})}}function Y(e,t){return e?.length?e.map(e=>e.message).join(`; `):t}var Be=`#graphql
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
`,X=`sr_subscriber_email`;function Ve(){try{return window.localStorage.getItem(X)}catch{return null}}function He(e){try{window.localStorage.setItem(X,e)}catch{}}async function Ue(e){let t=e.trim();if(!t)throw Error(`Enter an email address to subscribe.`);if(!H)throw Error(`Newsletter signup is unavailable right now.`);let{data:n,errors:r}=await H.request(Be,{variables:{email:t}}),i=n?.customerEmailMarketingSubscribe;if(r||!i)throw Error(`Unable to subscribe right now. Please try again.`);if(i.customerUserErrors?.length)throw Error(Y(i.customerUserErrors,`Unable to subscribe right now. Please try again.`));He(t)}async function We(e=12){if(!V)return[];let{data:t,errors:n}=await V.request(ke,{variables:{first:e}});return n?(console.error(`Shopify products query failed`,n),[]):Ge(t?.products?.edges?.map(e=>q(e.node))??[])}function Ge(e){let t=new Set(e.map(e=>e.handle)),r=n.filter(e=>!t.has(e.handle));return[...e,...r]}var Z=new Map;function Q(e){$(e)}async function $(e){let t=Z.get(e);if(t)return t;let n=Ke(e).then(t=>(t||Z.delete(e),t));return Z.set(e,n),n}async function Ke(e){if(!V)return null;let{data:t,errors:n}=await V.request(Ae,{variables:{handle:e}});return n||!t?.product?(console.error(`Shopify product query failed`,n),null):q(t.product)}async function qe(e=[],t=[]){if(!V)throw Error(`Shopify is not configured`);let n=Ve(),{data:r,errors:i}=await V.request(je,{variables:{lines:e,attributes:t,buyerIdentity:n?{email:n}:void 0},headers:o()}),a=r?.cartCreate;if(i||!a?.cart)throw Error(Y(a?.userErrors,`Unable to create cart`));if(a.userErrors?.length)throw Error(Y(a.userErrors,`Unable to create cart`));return J(a.cart)}async function Je(e){if(!V)return null;let{data:t,errors:n}=await V.request(Ne,{variables:{id:e},headers:o()});return n?(console.error(`Shopify cart query failed`,n),null):t?.cart?J(t.cart):null}async function Ye(e,t){if(!V)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await V.request(Me,{variables:{cartId:e,attributes:t},headers:o()}),i=n?.cartAttributesUpdate;if(r||!i?.cart||i.userErrors?.length)throw Error(Y(i?.userErrors,`Unable to update cart`));return J(i.cart)}async function Xe(e,t){if(!V)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await V.request(Pe,{variables:{cartId:e,lines:t},headers:o()}),i=n?.cartLinesAdd;if(r||!i?.cart)throw Error(Y(i?.userErrors,`Unable to add to cart`));if(i.userErrors?.length)throw Error(Y(i.userErrors,`Unable to add to cart`));return J(i.cart)}async function Ze(e,t){if(!V)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await V.request(Fe,{variables:{cartId:e,lines:t},headers:o()}),i=n?.cartLinesUpdate;if(r||!i?.cart)throw Error(Y(i?.userErrors,`Unable to update cart`));if(i.userErrors?.length)throw Error(Y(i.userErrors,`Unable to update cart`));return J(i.cart)}async function Qe(e,t){if(!V)throw Error(`Shopify is not configured`);let{data:n,errors:r}=await V.request(Ie,{variables:{cartId:e,lineIds:t},headers:o()}),i=n?.cartLinesRemove;if(r||!i?.cart)throw Error(Y(i?.userErrors,`Unable to remove from cart`));if(i.userErrors?.length)throw Error(Y(i.userErrors,`Unable to remove from cart`));return J(i.cart)}export{Xe as addCartLines,qe as createCart,Je as fetchCart,$ as fetchProductByHandle,We as fetchProducts,t as filterProductsByCategory,K as formatPrice,e as getPlaceholderProductImage,B as isShopifyConfigured,n as placeholderProducts,Q as prefetchProductByHandle,Qe as removeCartLines,V as shopifyClient,i as sortProductsBySubcategory,Ue as subscribeToNewsletter,Ye as updateCartAttributes,Ze as updateCartLines};