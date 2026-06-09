import '@testing-library/jest-dom';

if (typeof window !== 'undefined') {
    HTMLElement.prototype.scrollTo = () => {};
    HTMLElement.prototype.scrollIntoView = () => {};
}
