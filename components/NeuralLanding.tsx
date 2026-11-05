"use client";

// NEURAL 소개 화면(메인). 영상 배경 위에 제목·버튼을 얹고, 버튼을 누르면 대시보드(/dashboard)로 이동한다.
// 지표 기능은 /dashboard 에 그대로 있다. 이 화면은 스크롤 없이 한 장으로 고정된다.
// 메뉴 열기/닫기는 체크박스와 CSS만으로 동작하고, 아래 스크립트는 (1) 움직임 줄이기 설정에 맞춰 영상 정지,
// (2) 등장 효과가 끝나면 다시 재생되지 않게 표시하는 두 가지뿐이다.

import Link from "next/link";
import { useEffect, useRef } from "react";
import "./neural.css";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_104303_0c6d60b2-9353-408e-9449-585108a22fb5.mp4";
const POSTER_URL =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/130837c4-0244-4f37-9c61-8d801d93fd29.jpg";

export default function NeuralLanding() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef<HTMLSpanElement>(null);

  // (a) 움직임 줄이기 설정이면 배경 영상을 멈춰 첫 장면만 보여준다. 설정이 바뀌면 바로 따라간다.
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const video = videoRef.current;
    if (!query || !video) return;
    const sync = () => {
      if (query.matches) {
        video.pause();
      } else {
        video.play()?.catch(() => undefined);
      }
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // (b) 등장 효과는 CSS가 하고, 마지막 글자의 효과가 끝나면 is-entered를 붙여 다시 재생되지 않게 한다.
  useEffect(() => {
    const root = document.documentElement;
    const last = lastRef.current;
    const done = () => {
      clearTimeout(timer);
      last?.removeEventListener("animationend", done);
      root.classList.add("is-entered");
    };
    last?.addEventListener("animationend", done);
    // 혹시 animationend가 오지 않아도 4초 뒤에는 마무리한다.
    const timer = setTimeout(done, 4000);
    return () => {
      clearTimeout(timer);
      last?.removeEventListener("animationend", done);
      // 다른 화면으로 갔다가 돌아오면 등장 효과를 다시 보여준다.
      root.classList.remove("is-entered");
    };
  }, []);

  return (
    <div className="neural">
      <video
        ref={videoRef}
        className="art"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        poster={POSTER_URL}
        src={VIDEO_URL}
      />
      <div className="veil" />

      <header className="bar">
        <a className="brand" href="#" aria-label="NEURAL">
          <svg viewBox="0 0 23 17" aria-hidden="true">
            <path d="M8.15 0.9 L4.55 0.9 L0.5 9.3 L4.1 9.3 Z" />
            <path d="M17.0 0 L13.4 0 L6.15 16.4 L9.75 16.4 Z" />
            <path d="M22.9 0 L19.3 0 L15.0 7.6 L18.6 7.6 Z" />
            <path d="M22.6 6.9 L19.0 6.9 L14.05 16.4 L17.65 16.4 Z" />
          </svg>
          <span id="word">NEURAL</span>
        </a>
        <input className="navtoggle" type="checkbox" id="nav-open" aria-label="메뉴 열기" />
        <label className="scrim" htmlFor="nav-open" aria-hidden="true" />
        <label className="burger" htmlFor="nav-open" aria-label="메뉴">
          <svg viewBox="0 0 22 14" aria-hidden="true">
            <path className="b1" d="M1 1 H21" />
            <path className="b2" d="M1 7 H21" />
            <path className="b3" d="M1 13 H21" />
          </svg>
        </label>
        <div className="navpanel">
          <nav className="menu">
            <a href="#">
              <span id="about">소개</span>
            </a>
            <Link href="/dashboard">
              <span id="product">대시보드</span>
            </Link>
            <a href="#">
              <span id="solutions">활용 방법</span>
              <svg className="caret" viewBox="0 0 9 6" aria-hidden="true">
                <path d="M0.7 1.1 L4.5 4.6 L8.3 1.1" />
              </svg>
            </a>
          </nav>
          <Link className="login" href="/dashboard">
            <span id="login">지표 입력하기</span>
            <svg className="navarrow" viewBox="0 0 10 9" aria-hidden="true">
              <path d="M0 4.5 H9.1 M5.4 0.9 L9.2 4.5 L5.4 8.1" />
            </svg>
          </Link>
          <a className="pill" href="#">
            <span id="contact">문의하기</span>
          </a>
        </div>
      </header>

      <main className="hero">
        <h1 className="title">
          <span id="h1a">성과지표를 한눈에 보고</span>
          <span id="h1b">뒤처진 지표를 바로 찾으세요.</span>
        </h1>
        <p className="sub">
          <span id="sub1">진척률·경과율·보완사항을</span>
          <span id="sub2">한 화면에서 관리합니다.</span>
        </p>
        <Link className="cta" href="/dashboard">
          <span id="cta">대시보드 열기</span>
          <svg className="arrow" viewBox="0 0 16 11" aria-hidden="true">
            <path d="M0 5.5 H14.6 M10.3 1.2 L14.9 5.5 L10.3 9.8" />
          </svg>
        </Link>
        <ul className="feats">
          {[
            ["f1", "진척률과 경과율 비교"],
            ["f2", "부진지표 강조"],
            ["f3", "월별 추이와 필요 실적"],
            ["f4", "엑셀 입출력"],
          ].map(([id, text]) => (
            <li key={id}>
              <svg className="chev" viewBox="0 0 11 20" aria-hidden="true">
                <path d="M1.15 1.15 L9.6 10 L1.15 18.85" />
              </svg>
              <span id={id}>{text}</span>
            </li>
          ))}
        </ul>
        <span className="rule" aria-hidden="true" />
      </main>

      <footer className="foot">
        <span id="foot1">입력한 지표는 이 컴퓨터의 브라우저에만 저장되며 서버로 보내지 않습니다.</span>
        <span id="foot2" ref={lastRef}>
          2026
        </span>
      </footer>
    </div>
  );
}
