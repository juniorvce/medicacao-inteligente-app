function Error() {
  return null
}

Error.getInitialProps = () => {
  return { statusCode: 500 }
}

export default Error
