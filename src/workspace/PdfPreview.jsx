import React, {useEffect, useRef, useState} from 'react'
import {Document, Page, pdfjs} from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString()

export default function PdfPreview({item}){
 const host=useRef(null),[width,setWidth]=useState(0),[pages,setPages]=useState(0),[zoom,setZoom]=useState(1),[failure,setFailure]=useState('')
 useEffect(()=>{if(!host.current)return;const observer=new ResizeObserver(entries=>setWidth(entries[0]?.contentRect.width||0));observer.observe(host.current);return()=>observer.disconnect()},[])
 return <div className="catalogue-pdf-viewer"><div className="catalogue-pdf-toolbar"><span>{pages?`${pages} page${pages===1?'':'s'}`:'Loading PDF…'}</span><div><button type="button" aria-label="Zoom out" onClick={()=>setZoom(value=>Math.max(.6,Math.round((value-.1)*10)/10))}>−</button><span>{Math.round(zoom*100)}%</span><button type="button" aria-label="Zoom in" onClick={()=>setZoom(value=>Math.min(1.6,Math.round((value+.1)*10)/10))}>+</button></div></div><div ref={host} className="catalogue-pdf-pages">{failure?<p className="catalogue-pdf-error">{failure} <a href={item.url} target="_blank" rel="noreferrer">Open PDF</a></p>:<Document file={{url:item.url,withCredentials:true}} onLoadSuccess={({numPages})=>{setPages(numPages);setFailure('')}} onLoadError={()=>setFailure('This PDF could not be previewed.')}>{Array.from({length:pages},(_,index)=><Page key={`${item.id}-${index+1}`} pageNumber={index+1} width={Math.max(1,width-24)} scale={zoom} renderTextLayer renderAnnotationLayer/>)}</Document>}</div></div>
}
